from datetime import datetime, timezone, date as DateType
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from core.database import get_db
from core.security import crear_token
from core.dependencies import get_portal_derivador
from core.storage import (
    guardar_imagen_2d, guardar_dicom, guardar_preview_3d,
    get_url, dimension, listar_archivos_examen, eliminar_carpeta_examen,
)
from core.email_service import enviar_tarea_pendiente_a_doctora
from modulos.derivadores.models import Derivador, PortalMagicLink
from modulos.incidencias.models import Incidencia
from modulos.pacientes.models import Paciente
from modulos.examenes.models import Examen, ImagenExamen, RevisionExamen, TipoExamenCustom
from modulos.tarifas.models import TarifaDerivador

router = APIRouter(prefix="/api/portal", tags=["portal"])


class SolicitarAccesoBody(BaseModel):
    email: str


@router.post("/solicitar-acceso")
def solicitar_acceso(body: SolicitarAccesoBody, db: Session = Depends(get_db)):
    from core.email_service import enviar_magic_link_portal
    from core.config import settings
    import uuid
    from datetime import timedelta

    from sqlalchemy import func
    email_input = body.email.strip()
    derivador = db.query(Derivador).filter(
        func.lower(Derivador.email) == email_input.lower(),
        Derivador.activo == True,
    ).first()
    # Respuesta genérica para no revelar si el email existe
    if not derivador:
        return {"mensaje": "Si el email está registrado, recibirás el enlace en breve."}

    db.query(PortalMagicLink).filter(
        PortalMagicLink.derivador_id == derivador.id,
        PortalMagicLink.activo == True,
    ).update({"activo": False})

    token = str(uuid.uuid4())
    link = PortalMagicLink(
        derivador_id=derivador.id,
        token=token,
        expira_en=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(link)
    db.commit()

    url = f"{settings.FRONTEND_URL}/portal/acceder?token={token}"
    enviar_magic_link_portal(derivador, url)
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

@router.get("/acceder")
def acceder(token: str, db: Session = Depends(get_db)):
    link = db.query(PortalMagicLink).filter(
        PortalMagicLink.token == token,
        PortalMagicLink.activo == True,
    ).first()
    if not link:
        raise HTTPException(401, "Enlace inválido o ya usado")
    if link.expira_en < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(401, "Enlace expirado")

    link.activo = False
    db.commit()

    jwt = crear_token({"sub": str(link.derivador_id), "tipo": "portal"}, expires_minutes=60 * 24 * 7)
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
    rut_norm = rut.strip().upper()
    paciente = db.query(Paciente).filter(
        Paciente.derivador_id == derivador.id,
        Paciente.rut.ilike(rut_norm),
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
        rut=body.rut.strip().upper() if body.rut else None,
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
    rut = examen.paciente.rut or f"pac{examen.paciente_id}"
    tipo = examen.tipo_examen

    dim = _resolver_dim(tipo, derivador.radiologo_id, db)
    if dim == "AMBOS":
        if dim_override not in ("2D", "3D"):
            raise HTTPException(400, "dim_override='2D' o '3D' requerido para tipos con ambas dimensiones")
        dim = dim_override

    rid = derivador.radiologo_id
    if subtipo == "dicom":
        path = guardar_dicom(rid, rut, examen_id, tipo, archivo.filename, datos, ubicacion=ubicacion, dim=dim)
        db_tipo = "DICOM"
    elif subtipo == "preview":
        path = guardar_preview_3d(rid, rut, examen_id, tipo, archivo.filename, datos, dim=dim)
        db_tipo = "PREVIEW"
    else:
        path = guardar_imagen_2d(rid, rut, examen_id, tipo, archivo.filename, datos, dim=dim)
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

    rut = examen.paciente.rut or f"pac{examen.paciente_id}"
    eliminar_carpeta_examen(derivador.radiologo_id, rut, examen_id)
    db.delete(examen)
    db.commit()


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


# ── Notificación explícita ────────────────────────────────────────────────────

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

    rut = examen.paciente.rut or f"pac{examen.paciente_id}"
    archivos = listar_archivos_examen(derivador.radiologo_id, rut, examen_id, examen.tipo_examen)
    if not archivos:
        raise HTTPException(400, "No hay imágenes subidas. Suba las imágenes antes de notificar.")

    radiologo = derivador.radiologo
    ok, msg = enviar_tarea_pendiente_a_doctora(
        derivador, examen.paciente, examen,
        radiologo_email=radiologo.email or "",
    )
    examen.notificacion_doctora_enviada = True
    db.commit()
    return {"notificado": ok, "mensaje": msg}


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
