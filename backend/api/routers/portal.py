import uuid
import json
import shutil
import tempfile
import zipstream as _zs
from datetime import date as DateType
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from core.database import get_db
from core.security import crear_token
from core.dependencies import get_portal_derivador
from core.rut_utils import normalizar_rut, limpiar_rut
from core.storage import (
    guardar_imagen_2d, guardar_dicom, guardar_preview_3d,
    guardar_desde_archivo, key_dicom, key_imagen_2d, key_preview_3d,
    get_url, dimension, eliminar_carpeta_examen, stream_bytes, _is_r2,
    iniciar_multipart, presign_parte, completar_multipart_r2,
    abortar_multipart_r2, leer_cabecera, eliminar_objeto,
)
from fastapi.responses import StreamingResponse
from core.dicom_utils import es_dicom
from modulos.derivadores.models import Derivador
from modulos.incidencias.models import Incidencia
from modulos.pacientes.models import Paciente
from modulos.examenes.models import Examen, ImagenExamen, RevisionExamen, TipoExamenCustom
from modulos.tarifas.models import TarifaDerivador
from modulos.notificaciones.models import Notificacion
from modulos.informes.models import Informe

router = APIRouter(prefix="/api/portal", tags=["portal"])

# /tmp es siempre escribible en Docker, independiente de permisos del volumen de datos
_CHUNK_DIR = Path(tempfile.gettempdir()) / "maca_chunks"
_MULTIPART_DIR = Path(tempfile.gettempdir()) / "maca_multipart"


class IniciarSubidaBody(BaseModel):
    nombre: str
    total_chunks: int
    subtipo: str
    ubicacion: str = ""
    dim_override: Optional[str] = None


class FinalizarSubidaBody(BaseModel):
    upload_id: str


@router.get("/tenant-info")
def tenant_info(request: Request):
    from core.tenant import get_tenant
    radiologo = get_tenant(request)
    return {"nombre_display": radiologo.nombre_display or "Radiología"}


class SolicitarAccesoBody(BaseModel):
    email: str


@router.post("/solicitar-acceso")
def solicitar_acceso(body: SolicitarAccesoBody, db: Session = Depends(get_db)):
    from core.email_service import enviar_magic_link_portal, enviar_magic_links_multisede
    from core.config import settings
    from sqlalchemy import func

    email_input = body.email.strip()
    derivadores = db.query(Derivador).filter(
        func.lower(Derivador.email) == email_input.lower(),
        Derivador.activo == True,
    ).all()
    if not derivadores:
        return {"mensaje": "Si el email está registrado, recibirás el enlace en breve."}

    if len(derivadores) == 1:
        derivador = derivadores[0]
        radiologo = derivador.radiologo
        url = f"https://{radiologo.slug}.{settings.BASE_DOMAIN}/portal/acceder/{derivador.portal_slug}?t={derivador.portal_token}"
        enviar_magic_link_portal(derivador, url, radiologo_nombre=radiologo.nombre_display or "Radiología")
    else:
        radiologo = derivadores[0].radiologo
        sedes = [
            {
                "nombre": d.nombre,
                "url": f"https://{d.radiologo.slug}.{settings.BASE_DOMAIN}/portal/acceder/{d.portal_slug}?t={d.portal_token}",
            }
            for d in derivadores
        ]
        enviar_magic_links_multisede(email_input, sedes, radiologo_nombre=radiologo.nombre_display or "Radiología")
    return {"mensaje": "Si el email está registrado, recibirás el enlace en breve."}


def _resolver_dim(tipo_examen: str, radiologo_id: int, db: Session) -> str:
    from core.storage import EXAMENES_2D, EXAMENES_3D
    if tipo_examen in EXAMENES_3D:
        return "3D"
    if tipo_examen not in EXAMENES_2D:
        custom = db.query(TipoExamenCustom).filter(
            TipoExamenCustom.nombre == tipo_examen,
            TipoExamenCustom.radiologo_id == radiologo_id,
        ).first()
        if custom:
            return custom.dimension
    return "2D"


# ── Auth ──────────────────────────────────────────────────────────────────────

@router.get("/acceder/{slug}")
def acceder(slug: str, t: str = Query(...), db: Session = Depends(get_db)):
    derivador = db.query(Derivador).filter(
        Derivador.portal_token == t,
        Derivador.portal_slug == slug,
        Derivador.activo == True,
    ).first()
    if not derivador:
        raise HTTPException(401, "Enlace inválido")
    jwt = crear_token({"sub": str(derivador.id), "tipo": "portal"}, expires_minutes=60 * 24 * 30)
    return {"access_token": jwt, "token_type": "bearer"}


@router.get("/me")
def me(derivador: Derivador = Depends(get_portal_derivador)):
    return {"id": derivador.id, "nombre": derivador.nombre, "email": derivador.email}


# ── Pacientes ─────────────────────────────────────────────────────────────────

class PacienteCreate(BaseModel):
    nombre_completo: str
    rut: Optional[str] = None
    fecha_nacimiento: str  # obligatorio — ISO date YYYY-MM-DD


class PacienteResponse(BaseModel):
    id: int
    nombre_completo: str
    rut: Optional[str]
    fecha_nacimiento: Optional[DateType]

    class Config:
        from_attributes = True


@router.get("/pacientes/buscar")
def buscar_paciente(
    rut: str = Query(..., min_length=1),
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    from sqlalchemy import func
    rut_limpio = limpiar_rut(rut)
    paciente = db.query(Paciente).filter(
        Paciente.derivador_id == derivador.id,
        func.regexp_replace(Paciente.rut, r'[.\-\s]', '', 'g') == rut_limpio,
    ).first()
    if not paciente:
        return None
    return {
        "id": paciente.id,
        "nombre_completo": paciente.nombre_completo,
        "rut": paciente.rut,
        "fecha_nacimiento": paciente.fecha_nacimiento.isoformat() if paciente.fecha_nacimiento else None,
    }


@router.get("/pacientes", response_model=list[PacienteResponse])
def listar_pacientes(derivador: Derivador = Depends(get_portal_derivador), db: Session = Depends(get_db)):
    return db.query(Paciente).filter(Paciente.derivador_id == derivador.id).order_by(Paciente.creado_en.desc()).all()


@router.post("/pacientes", response_model=PacienteResponse, status_code=201)
def crear_paciente(body: PacienteCreate, derivador: Derivador = Depends(get_portal_derivador), db: Session = Depends(get_db)):
    from datetime import date
    try:
        fecha = date.fromisoformat(body.fecha_nacimiento)
    except ValueError:
        raise HTTPException(400, "fecha_nacimiento debe ser YYYY-MM-DD")

    paciente = Paciente(
        radiologo_id=derivador.radiologo_id,
        derivador_id=derivador.id,
        nombre_completo=body.nombre_completo,
        rut=normalizar_rut(body.rut) if body.rut else None,
        fecha_nacimiento=fecha,
    )
    db.add(paciente)
    db.commit()
    db.refresh(paciente)
    return paciente


# ── Exámenes ──────────────────────────────────────────────────────────────────

class ExamenCreate(BaseModel):
    paciente_id: int
    tipo_examen: str
    caso_id: str | None = None


@router.get("/tipos-disponibles")
def tipos_disponibles(derivador: Derivador = Depends(get_portal_derivador), db: Session = Depends(get_db)):
    from sqlalchemy import func
    tarifas_nombres = {
        t.tipo_examen.upper() for t in
        db.query(TarifaDerivador).filter(TarifaDerivador.derivador_id == derivador.id, TarifaDerivador.activa == True).all()
    }
    if not tarifas_nombres:
        return []
    tipos = (db.query(TipoExamenCustom)
             .filter(TipoExamenCustom.radiologo_id == derivador.radiologo_id,
                     func.upper(TipoExamenCustom.nombre).in_(tarifas_nombres),
                     TipoExamenCustom.activo == True)
             .order_by(TipoExamenCustom.categoria, TipoExamenCustom.nombre).all())
    return [{"nombre": t.nombre, "dimension": t.dimension, "categoria": t.categoria, "custom": True} for t in tipos]


@router.get("/examenes")
def listar_examenes(derivador: Derivador = Depends(get_portal_derivador), db: Session = Depends(get_db)):
    examenes = (db.query(Examen)
                .filter(Examen.derivador_id == derivador.id, Examen.estado != "BORRADOR")
                .order_by(Examen.creado_en.desc())
                .all())
    ids = [e.id for e in examenes]
    inc_map = {
        i.examen_id: i.estado
        for i in db.query(Incidencia).filter(Incidencia.examen_id.in_(ids)).all()
    } if ids else {}
    return [
        {
            "id": e.id,
            "caso_id": e.caso_id,
            "paciente_id": e.paciente_id,
            "paciente_nombre": e.paciente.nombre_completo,
            "paciente_rut": e.paciente.rut,
            "tipo_examen": e.tipo_examen,
            "estado": e.estado,
            "version": e.version or 0,
            "dimension": _resolver_dim(e.tipo_examen, derivador.radiologo_id, db),
            "creado_en": e.creado_en,
            "incidencia_estado": inc_map.get(e.id),
        }
        for e in examenes
    ]


@router.post("/examenes", status_code=201)
def crear_examen(body: ExamenCreate, derivador: Derivador = Depends(get_portal_derivador), db: Session = Depends(get_db)):
    paciente = db.query(Paciente).filter(
        Paciente.id == body.paciente_id, Paciente.derivador_id == derivador.id
    ).first()
    if not paciente:
        raise HTTPException(404, "Paciente no encontrado")

    examen = Examen(
        paciente_id=body.paciente_id,
        derivador_id=derivador.id,
        tipo_examen=body.tipo_examen,
        caso_id=body.caso_id,
    )
    db.add(examen)
    db.commit()
    db.refresh(examen)
    return {
        "id": examen.id,
        "paciente_id": examen.paciente_id,
        "tipo_examen": examen.tipo_examen,
        "estado": examen.estado,
        "version": 0,
        "dimension": _resolver_dim(examen.tipo_examen, derivador.radiologo_id, db),
        "creado_en": examen.creado_en,
    }


@router.get("/examenes/{examen_id}/revisiones")
def listar_revisiones(
    examen_id: int,
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    examen = db.query(Examen).filter(
        Examen.id == examen_id, Examen.derivador_id == derivador.id
    ).first()
    if not examen:
        raise HTTPException(404, "Examen no encontrado")
    return [
        {
            "id": r.id,
            "numero_version": r.numero_version,
            "tipo_cambio": r.tipo_cambio,
            "nombre_archivo": r.nombre_archivo,
            "comentario": r.comentario,
            "creado_en": r.creado_en,
        }
        for r in examen.revisiones
    ]


@router.get("/examenes/{examen_id}")
def detalle_examen(
    examen_id: int,
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    examen = db.query(Examen).filter(
        Examen.id == examen_id, Examen.derivador_id == derivador.id
    ).first()
    if not examen:
        raise HTTPException(404, "Examen no encontrado")
    return {
        "id": examen.id,
        "paciente_id": examen.paciente_id,
        "paciente_nombre": examen.paciente.nombre_completo,
        "paciente_rut": examen.paciente.rut,
        "tipo_examen": examen.tipo_examen,
        "estado": examen.estado,
        "version": examen.version or 0,
        "dimension": _resolver_dim(examen.tipo_examen, derivador.radiologo_id, db),
        "creado_en": examen.creado_en,
        "informe_url": get_url(examen.informe.ruta_pdf) if examen.informe else None,
        "informes": [
            {"id": inf.id, "nombre": inf.ruta_pdf.rsplit("/", 1)[-1], "url": get_url(inf.ruta_pdf)}
            for inf in examen.informes
        ],
    }


# ── Imágenes ──────────────────────────────────────────────────────────────────

def _subtipo_desde_tipo(tipo: str) -> str:
    if tipo == "DICOM":
        return "dicom"
    if tipo == "PREVIEW":
        return "preview"
    return "imagen"


@router.post("/examenes/{examen_id}/imagenes", status_code=201)
async def subir_imagen(
    examen_id: int,
    subtipo: str = Form(...),
    archivo: UploadFile = File(...),
    ubicacion: str = Form(""),
    dim_override: Optional[str] = Form(None),
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    examen = db.query(Examen).filter(
        Examen.id == examen_id, Examen.derivador_id == derivador.id
    ).first()
    if not examen:
        raise HTTPException(404, "Examen no encontrado")
    if examen.estado == "COMPLETADO":
        raise HTTPException(400, "No se puede modificar un examen completado")

    datos = await archivo.read()

    if subtipo == "dicom" and not es_dicom(datos):
        raise HTTPException(400, "El archivo no es un DICOM válido")

    tipo = examen.tipo_examen
    pid = examen.paciente_id
    pnombre = examen.paciente.nombre_completo

    dim = _resolver_dim(tipo, derivador.radiologo_id, db)
    if dim == "AMBOS":
        if dim_override not in ("2D", "3D"):
            raise HTTPException(400, "dim_override='2D' o '3D' requerido para tipos con ambas dimensiones")
        dim = dim_override

    rid = derivador.radiologo_id
    did = derivador.id
    if subtipo == "dicom":
        path = guardar_dicom(rid, did, pid, pnombre, examen_id, tipo, archivo.filename, datos, ubicacion=ubicacion, dim=dim)
        db_tipo = "DICOM"
    elif subtipo == "preview":
        path = guardar_preview_3d(rid, did, pid, pnombre, examen_id, tipo, archivo.filename, datos, dim=dim)
        db_tipo = "PREVIEW"
    else:
        path = guardar_imagen_2d(rid, did, pid, pnombre, examen_id, tipo, archivo.filename, datos, dim=dim)
        db_tipo = "2D"

    imagen = ImagenExamen(
        examen_id=examen_id,
        tipo=db_tipo,
        nombre_archivo=archivo.filename,
        ruta=str(path),
    )
    db.add(imagen)
    db.commit()
    db.refresh(imagen)

    return {
        "id": imagen.id,
        "nombre": archivo.filename,
        "subtipo": subtipo,
        "url": get_url(path),
    }


# ── Upload chunkeado ──────────────────────────────────────────────────────────

@router.post("/examenes/{examen_id}/imagenes/iniciar-subida", status_code=201)
async def iniciar_subida_chunked(
    examen_id: int,
    body: IniciarSubidaBody,
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    examen = db.query(Examen).filter(
        Examen.id == examen_id, Examen.derivador_id == derivador.id
    ).first()
    if not examen:
        raise HTTPException(404, "Examen no encontrado")
    if examen.estado == "COMPLETADO":
        raise HTTPException(400, "No se puede modificar un examen completado")

    upload_id = str(uuid.uuid4())
    chunk_dir = _CHUNK_DIR / upload_id
    chunk_dir.mkdir(parents=True, exist_ok=True)
    meta = {
        "nombre": body.nombre,
        "total_chunks": body.total_chunks,
        "subtipo": body.subtipo,
        "ubicacion": body.ubicacion,
        "dim_override": body.dim_override,
        "examen_id": examen_id,
        "derivador_id": derivador.id,
    }
    (chunk_dir / "meta.json").write_text(json.dumps(meta))
    return {"upload_id": upload_id}


@router.post("/examenes/{examen_id}/imagenes/chunk")
async def subir_chunk(
    examen_id: int,
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    chunk_data: UploadFile = File(...),
    derivador: Derivador = Depends(get_portal_derivador),
):
    chunk_dir = _CHUNK_DIR / upload_id
    if not chunk_dir.exists():
        raise HTTPException(404, "upload_id inválido")
    meta = json.loads((chunk_dir / "meta.json").read_text())
    if meta["examen_id"] != examen_id or meta["derivador_id"] != derivador.id:
        raise HTTPException(403)
    (chunk_dir / f"chunk_{chunk_index}").write_bytes(await chunk_data.read())
    return {"recibido": chunk_index}


@router.post("/examenes/{examen_id}/imagenes/finalizar-subida", status_code=201)
def finalizar_subida_chunked(
    examen_id: int,
    body: FinalizarSubidaBody,
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    chunk_dir = _CHUNK_DIR / body.upload_id
    if not chunk_dir.exists():
        raise HTTPException(404, "upload_id inválido")
    meta = json.loads((chunk_dir / "meta.json").read_text())
    if meta["examen_id"] != examen_id or meta["derivador_id"] != derivador.id:
        raise HTTPException(403)

    total = meta["total_chunks"]
    subtipo = meta["subtipo"]
    nombre = meta["nombre"]

    # Verificar todos los chunks antes de ensamblar
    faltantes = [i for i in range(total) if not (chunk_dir / f"chunk_{i}").exists()]
    if faltantes:
        raise HTTPException(400, f"Faltan chunks: {faltantes}")

    # Ensamblar en disco (sin cargar en RAM)
    assembled = chunk_dir / "assembled"
    try:
        with open(assembled, "wb") as out:
            for i in range(total):
                out.write((chunk_dir / f"chunk_{i}").read_bytes())
    except Exception as exc:
        shutil.rmtree(chunk_dir, ignore_errors=True)
        raise HTTPException(500, f"Error ensamblando archivo: {exc}")

    # Validar DICOM leyendo solo los primeros 132 bytes
    if subtipo == "dicom":
        with open(assembled, "rb") as f:
            header = f.read(132)
        if not es_dicom(header):
            shutil.rmtree(chunk_dir, ignore_errors=True)
            raise HTTPException(400, "El archivo no es un DICOM válido")

    examen = db.query(Examen).filter(
        Examen.id == examen_id, Examen.derivador_id == derivador.id
    ).first()
    if not examen:
        shutil.rmtree(chunk_dir, ignore_errors=True)
        raise HTTPException(404)

    tipo = examen.tipo_examen
    pid = examen.paciente_id
    pnombre = examen.paciente.nombre_completo
    ubicacion = meta["ubicacion"]
    dim_override = meta["dim_override"]

    dim = _resolver_dim(tipo, derivador.radiologo_id, db)
    if dim == "AMBOS":
        if dim_override not in ("2D", "3D"):
            shutil.rmtree(chunk_dir, ignore_errors=True)
            raise HTTPException(400, "dim_override='2D' o '3D' requerido")
        dim = dim_override

    rid = derivador.radiologo_id
    did = derivador.id

    # Calcular key y tipo DB
    if subtipo == "dicom":
        key = key_dicom(rid, did, pid, pnombre, examen_id, tipo, nombre, ubicacion=ubicacion, dim=dim)
        content_type = "application/dicom"
        db_tipo = "DICOM"
    elif subtipo == "preview":
        key = key_preview_3d(rid, did, pid, pnombre, examen_id, tipo, nombre, dim=dim)
        content_type = "image/png"
        db_tipo = "PREVIEW"
    else:
        key = key_imagen_2d(rid, did, pid, pnombre, examen_id, tipo, nombre, dim=dim)
        ext = nombre.rsplit(".", 1)[-1].lower()
        content_type = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}.get(ext, "application/octet-stream")
        db_tipo = "2D"

    # Subir a storage en streaming (sin cargar en RAM)
    try:
        path = guardar_desde_archivo(key, assembled, content_type)
    except Exception as exc:
        shutil.rmtree(chunk_dir, ignore_errors=True)
        raise HTTPException(500, f"Error subiendo a storage: {exc}")

    imagen = ImagenExamen(examen_id=examen_id, tipo=db_tipo, nombre_archivo=nombre, ruta=str(path))
    db.add(imagen)
    db.commit()
    db.refresh(imagen)
    shutil.rmtree(chunk_dir, ignore_errors=True)

    return {"id": imagen.id, "nombre": nombre, "subtipo": subtipo, "url": get_url(path)}


# ── Upload directo a R2 (multipart presignado) ────────────────────────────────

class PresignMultipartBody(BaseModel):
    nombre: str
    total_parts: int
    subtipo: str
    ubicacion: str = ""
    dim_override: Optional[str] = None


class PartInfo(BaseModel):
    part_number: int
    etag: str


class CompletarMultipartBody(BaseModel):
    upload_id: str
    parts: list[PartInfo]


@router.post("/examenes/{examen_id}/imagenes/presign-multipart", status_code=201)
def presign_multipart(
    examen_id: int,
    body: PresignMultipartBody,
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    if not _is_r2():
        raise HTTPException(501, "Direct upload solo disponible con storage R2")

    examen = db.query(Examen).filter(
        Examen.id == examen_id, Examen.derivador_id == derivador.id
    ).first()
    if not examen:
        raise HTTPException(404, "Examen no encontrado")
    if examen.estado == "COMPLETADO":
        raise HTTPException(400, "No se puede modificar un examen completado")

    tipo = examen.tipo_examen
    pid = examen.paciente_id
    pnombre = examen.paciente.nombre_completo

    dim = _resolver_dim(tipo, derivador.radiologo_id, db)
    if dim == "AMBOS":
        if body.dim_override not in ("2D", "3D"):
            raise HTTPException(400, "dim_override='2D' o '3D' requerido")
        dim = body.dim_override

    rid = derivador.radiologo_id
    did = derivador.id

    if body.subtipo == "dicom":
        key = key_dicom(rid, did, pid, pnombre, examen_id, tipo, body.nombre, ubicacion=body.ubicacion, dim=dim)
        content_type = "application/dicom"
    elif body.subtipo == "preview":
        key = key_preview_3d(rid, did, pid, pnombre, examen_id, tipo, body.nombre, dim=dim)
        content_type = "image/png"
    else:
        key = key_imagen_2d(rid, did, pid, pnombre, examen_id, tipo, body.nombre, dim=dim)
        ext = body.nombre.rsplit(".", 1)[-1].lower()
        content_type = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}.get(ext, "application/octet-stream")

    r2_upload_id = iniciar_multipart(key, content_type)
    meta_id = str(uuid.uuid4())  # UUID corto como nombre de archivo (UploadId de R2 es >200 chars)

    _MULTIPART_DIR.mkdir(exist_ok=True)
    (_MULTIPART_DIR / f"{meta_id}.json").write_text(json.dumps({
        "key": key, "r2_upload_id": r2_upload_id, "examen_id": examen_id,
        "subtipo": body.subtipo, "dim": dim, "nombre": body.nombre,
    }))

    parts = [
        {"part_number": i + 1, "url": presign_parte(key, r2_upload_id, i + 1)}
        for i in range(body.total_parts)
    ]
    return {"upload_id": meta_id, "parts": parts}


@router.post("/examenes/{examen_id}/imagenes/completar-multipart", status_code=201)
def completar_multipart_endpoint(
    examen_id: int,
    body: CompletarMultipartBody,
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    meta_file = _MULTIPART_DIR / f"{body.upload_id}.json"
    if not meta_file.exists():
        raise HTTPException(404, "Upload no encontrado o expirado")

    meta = json.loads(meta_file.read_text())
    key = meta["key"]
    r2_upload_id = meta["r2_upload_id"]
    subtipo = meta["subtipo"]
    nombre = meta["nombre"]

    s3_parts = [{"PartNumber": p.part_number, "ETag": p.etag} for p in body.parts]

    try:
        completar_multipart_r2(key, r2_upload_id, s3_parts)
    except Exception as exc:
        abortar_multipart_r2(key, r2_upload_id)
        meta_file.unlink(missing_ok=True)
        raise HTTPException(500, f"Error completando upload: {exc}")

    meta_file.unlink(missing_ok=True)

    db_tipo = {"dicom": "DICOM", "preview": "PREVIEW"}.get(subtipo, "2D")
    examen = db.query(Examen).filter(
        Examen.id == examen_id, Examen.derivador_id == derivador.id
    ).first()
    if not examen:
        raise HTTPException(404)

    imagen = ImagenExamen(examen_id=examen_id, tipo=db_tipo, nombre_archivo=nombre, ruta=key)
    db.add(imagen)
    db.commit()
    db.refresh(imagen)

    return {"id": imagen.id, "nombre": nombre, "subtipo": subtipo, "url": get_url(key)}


@router.get("/examenes/{examen_id}/informes/descargar")
def descargar_informes(
    examen_id: int,
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    examen = db.query(Examen).filter(
        Examen.id == examen_id, Examen.derivador_id == derivador.id
    ).first()
    if not examen:
        raise HTTPException(404)
    if not examen.informes:
        raise HTTPException(404, "Sin informes")

    rut = examen.paciente.rut or f"pac{examen.paciente_id}"
    informes = list(examen.informes)

    def _generar():
        zf = _zs.ZipFile(mode="w", compression=_zs.ZIP_STORED, allowZip64=True)
        for i, inf in enumerate(informes, 1):
            nombre = inf.ruta_pdf.rsplit("/", 1)[-1]
            if len(informes) > 1:
                ext = nombre.rsplit(".", 1)[-1] if "." in nombre else "pdf"
                nombre = f"informe_{i}.{ext}"
            zf.write_iter(nombre, stream_bytes(inf.ruta_pdf))
        yield from zf

    filename = f"Informes_{rut}_{examen.tipo_examen}.zip"
    return StreamingResponse(
        _generar(), media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Content-Encoding": "identity"},
    )


@router.get("/examenes/{examen_id}/imagenes")
def listar_imagenes(
    examen_id: int,
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    examen = db.query(Examen).filter(
        Examen.id == examen_id, Examen.derivador_id == derivador.id
    ).first()
    if not examen:
        raise HTTPException(404, "Examen no encontrado")

    return [
        {
            "id": img.id,
            "nombre": img.nombre_archivo,
            "subtipo": _subtipo_desde_tipo(img.tipo),
            "url": get_url(img.ruta),
        }
        for img in examen.imagenes
    ]


@router.delete("/examenes/{examen_id}/imagenes/{imagen_id}", status_code=204)
def eliminar_imagen(
    examen_id: int,
    imagen_id: int,
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    examen = db.query(Examen).filter(
        Examen.id == examen_id, Examen.derivador_id == derivador.id
    ).first()
    if not examen:
        raise HTTPException(404, "Examen no encontrado")
    if examen.estado == "COMPLETADO":
        raise HTTPException(400, "No se puede modificar un examen completado")

    imagen = db.query(ImagenExamen).filter(
        ImagenExamen.id == imagen_id,
        ImagenExamen.examen_id == examen_id,
    ).first()
    if not imagen:
        raise HTTPException(404, "Imagen no encontrada")

    archivo_path = Path(imagen.ruta)
    if archivo_path.exists():
        archivo_path.unlink()

    db.delete(imagen)
    db.commit()


# ── Confirmar edición (crea versión) ─────────────────────────────────────────

class ConfirmarEdicionBody(BaseModel):
    comentario: Optional[str] = None


@router.post("/examenes/{examen_id}/confirmar-edicion")
def confirmar_edicion(
    examen_id: int,
    body: ConfirmarEdicionBody,
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    examen = db.query(Examen).filter(
        Examen.id == examen_id, Examen.derivador_id == derivador.id
    ).first()
    if not examen:
        raise HTTPException(404, "Examen no encontrado")
    if examen.estado == "COMPLETADO":
        raise HTTPException(400, "Examen completado, no se puede modificar")

    examen.version = (examen.version or 0) + 1
    revision = RevisionExamen(
        examen_id=examen_id,
        numero_version=examen.version,
        tipo_cambio="modificacion",
        comentario=body.comentario.strip() if body.comentario else None,
    )
    db.add(revision)
    db.commit()
    return {"version": examen.version}


@router.post("/examenes/{examen_id}/nota")
def guardar_nota(
    examen_id: int,
    body: ConfirmarEdicionBody,
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    examen = db.query(Examen).filter(
        Examen.id == examen_id, Examen.derivador_id == derivador.id
    ).first()
    if not examen:
        raise HTTPException(404, "Examen no encontrado")
    if not body.comentario or not body.comentario.strip():
        raise HTTPException(400, "La nota no puede estar vacía")

    revision = RevisionExamen(
        examen_id=examen_id,
        numero_version=examen.version or 0,
        tipo_cambio="nota",
        comentario=body.comentario.strip(),
    )
    db.add(revision)
    db.commit()
    return {"ok": True}


# ── Eliminar examen ───────────────────────────────────────────────────────────

@router.delete("/examenes/{examen_id}", status_code=204)
def eliminar_examen(
    examen_id: int,
    background_tasks: BackgroundTasks,
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    examen = db.query(Examen).filter(
        Examen.id == examen_id,
        Examen.derivador_id == derivador.id,
    ).first()
    if not examen:
        raise HTTPException(404, "Examen no encontrado")
    if examen.estado == "COMPLETADO":
        raise HTTPException(400, "No se puede eliminar un examen con informe completado")

    radiologo_id = derivador.radiologo_id
    derivador_id = derivador.id
    paciente_id = examen.paciente_id
    nombre_paciente = examen.paciente.nombre_completo
    try:
        db.query(Notificacion).filter(Notificacion.examen_id == examen_id).delete(synchronize_session=False)
        db.query(Informe).filter(Informe.examen_id == examen_id).delete(synchronize_session=False)
        db.delete(examen)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Error al eliminar: {str(e)}")
    background_tasks.add_task(eliminar_carpeta_examen, radiologo_id, derivador_id, paciente_id, nombre_paciente, examen_id)


# ── Confirmar tareas (BORRADOR → PENDIENTE) ──────────────────────────────────

class ConfirmarBody(BaseModel):
    examen_ids: list[int]


@router.post("/confirmar-tareas")
def confirmar_tareas(
    body: ConfirmarBody,
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    confirmados = []
    for eid in body.examen_ids:
        e = db.query(Examen).filter(
            Examen.id == eid,
            Examen.derivador_id == derivador.id,
            Examen.estado == "BORRADOR",
        ).first()
        if e:
            e.estado = "PENDIENTE"
            confirmados.append(eid)
    db.commit()
    return {"confirmados": confirmados}


# ── Notificación de caso (un email por caso, todos los exámenes) ─────────────

class NotificarCasoBody(BaseModel):
    examen_ids: list[int]


@router.post("/notificar-caso")
def notificar_caso(
    body: NotificarCasoBody,
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    examenes = [
        db.query(Examen).filter(Examen.id == eid, Examen.derivador_id == derivador.id).first()
        for eid in body.examen_ids
    ]
    examenes = [e for e in examenes if e is not None]
    if not examenes:
        raise HTTPException(404, "No se encontraron exámenes")

    for e in examenes:
        e.notificacion_doctora_enviada = True
    db.commit()
    return {"notificado": True, "mensaje": "ok"}


# ── Notificación individual (legacy) ─────────────────────────────────────────

@router.post("/examenes/{examen_id}/notificar")
def notificar_doctora(
    examen_id: int,
    derivador: Derivador = Depends(get_portal_derivador),
    db: Session = Depends(get_db),
):
    examen = db.query(Examen).filter(
        Examen.id == examen_id, Examen.derivador_id == derivador.id
    ).first()
    if not examen:
        raise HTTPException(404, "Examen no encontrado")
    examen.notificacion_doctora_enviada = True
    db.commit()
    return {"notificado": True, "mensaje": "ok"}


# ── Notificaciones portal ────────────────────────────────────────────────────

@router.get("/notificaciones")
def listar_notificaciones(derivador: Derivador = Depends(get_portal_derivador), db: Session = Depends(get_db)):
    from modulos.notificaciones.models import Notificacion
    nots = (db.query(Notificacion)
            .filter(Notificacion.derivador_id == derivador.id)
            .order_by(Notificacion.creado_en.desc())
            .limit(30)
            .all())
    return [
        {
            "id": n.id,
            "mensaje": n.mensaje,
            "leida": n.leida,
            "examen_id": n.examen_id,
            "creado_en": n.creado_en,
        }
        for n in nots
    ]


@router.post("/notificaciones/leer-todas", status_code=204)
def leer_todas(derivador: Derivador = Depends(get_portal_derivador), db: Session = Depends(get_db)):
    from modulos.notificaciones.models import Notificacion
    db.query(Notificacion).filter(
        Notificacion.derivador_id == derivador.id,
        Notificacion.leida == False,
    ).update({"leida": True})
    db.commit()


@router.post("/notificaciones/{nid}/leer", status_code=204)
def leer_notificacion(nid: int, derivador: Derivador = Depends(get_portal_derivador), db: Session = Depends(get_db)):
    from modulos.notificaciones.models import Notificacion
    n = db.query(Notificacion).filter(
        Notificacion.id == nid, Notificacion.derivador_id == derivador.id
    ).first()
    if n:
        n.leida = True
        db.commit()


# ── Tarifas (solo lectura) ────────────────────────────────────────────────────

@router.get("/tarifas")
def ver_tarifas(derivador: Derivador = Depends(get_portal_derivador), db: Session = Depends(get_db)):
    tarifas = db.query(TarifaDerivador).filter(TarifaDerivador.derivador_id == derivador.id).all()
    return [{"tipo_examen": t.tipo_examen, "precio": int(t.precio)} for t in tarifas]
