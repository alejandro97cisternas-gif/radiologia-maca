import uuid
import zipstream
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from core.database import get_db
from core.dependencies import get_current_user
from core.tenant import get_tenant
from core.storage import guardar_informe_pdf, get_url, get_bytes, stream_bytes
from core.email_service import enviar_informe_listo_a_derivador, enviar_caso_listo_a_derivador
from core.config import settings
from modulos.examenes.models import Examen, TipoExamenCustom
from modulos.informes.models import Informe
from modulos.incidencias.models import Incidencia
from modulos.notificaciones.models import Notificacion
from modulos.derivadores.models import Derivador

router = APIRouter(prefix="/api/examenes", tags=["examenes"])

ESTADOS_VALIDOS = ["PENDIENTE", "EN_PROCESO", "COMPLETADO"]


def _generar_link_portal(derivador, radiologo_slug: str) -> str:
    return f"https://{radiologo_slug}.{settings.BASE_DOMAIN}/portal/acceder/{derivador.portal_slug}?t={derivador.portal_token}"


@router.get("/tipos")
def listar_tipos(request: Request, db: Session = Depends(get_db)):
    radiologo = get_tenant(request)
    tipos = db.query(TipoExamenCustom).filter(
        TipoExamenCustom.radiologo_id == radiologo.id,
        TipoExamenCustom.activo == True,
    ).order_by(TipoExamenCustom.categoria, TipoExamenCustom.nombre).all()
    return [
        {"id": t.id, "nombre": t.nombre, "dimension": t.dimension, "categoria": t.categoria, "custom": True}
        for t in tipos
    ]


def _serializar(e: Examen, inc_estado: str | None = None) -> dict:
    return {
        "id": e.id,
        "caso_id": e.caso_id,
        "paciente": e.paciente.nombre_completo,
        "rut": e.paciente.rut,
        "paciente_id": e.paciente_id,
        "derivador": e.derivador.nombre,
        "derivador_id": e.derivador_id,
        "tipo_examen": e.tipo_examen,
        "estado": e.estado,
        "creado_en": e.creado_en,
        "completado_en": e.completado_en,
        "imagenes_count": len(e.imagenes),
        "tiene_informe": bool(e.informes),
        "informe_token": e.informes[-1].token_publico if e.informes else None,
        "incidencia_estado": inc_estado,
        "version": e.version or 0,
        "derivador_color": e.derivador.color or "#6b7280",
        "notificacion_derivador_enviada": e.notificacion_derivador_enviada,
    }


def _inc_map(db: Session, exam_ids: list[int]) -> dict[int, str]:
    if not exam_ids:
        return {}
    return {i.examen_id: i.estado for i in db.query(Incidencia).filter(Incidencia.examen_id.in_(exam_ids)).all()}


def _examen_del_tenant(examen_id: int, radiologo_id: int, db: Session) -> Examen:
    e = (db.query(Examen)
         .join(Derivador, Examen.derivador_id == Derivador.id)
         .filter(Examen.id == examen_id, Derivador.radiologo_id == radiologo_id)
         .first())
    if not e:
        raise HTTPException(404, "Examen no encontrado")
    return e


@router.get("/todos")
def todos(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    examenes = (db.query(Examen)
                .join(Derivador, Examen.derivador_id == Derivador.id)
                .filter(Derivador.radiologo_id == radiologo.id, Examen.estado != "BORRADOR")
                .order_by(Examen.creado_en.desc()).all())
    inc = _inc_map(db, [e.id for e in examenes])
    return [_serializar(e, inc.get(e.id)) for e in examenes]


@router.get("/{examen_id}")
def detalle(examen_id: int, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    e = _examen_del_tenant(examen_id, radiologo.id, db)
    inc = _inc_map(db, [e.id])
    data = _serializar(e, inc.get(e.id))
    data["imagenes"] = [
        {"id": img.id, "tipo": img.tipo, "nombre": img.nombre_archivo, "url": get_url(img.ruta)}
        for img in e.imagenes
    ]
    return data


@router.patch("/{examen_id}/estado")
def actualizar_estado(examen_id: int, body: dict, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    estado = body.get("estado")
    if estado not in ESTADOS_VALIDOS:
        raise HTTPException(400, f"Estado inválido. Válidos: {ESTADOS_VALIDOS}")
    radiologo = get_tenant(request)
    e = _examen_del_tenant(examen_id, radiologo.id, db)
    e.estado = estado
    if estado == "COMPLETADO":
        e.completado_en = datetime.now(timezone.utc)
    db.commit()
    return {"id": e.id, "estado": e.estado}


@router.post("/{examen_id}/informe", status_code=201)
async def subir_informe(
    examen_id: int,
    request: Request,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    radiologo = get_tenant(request)
    examen = _examen_del_tenant(examen_id, radiologo.id, db)

    datos = await archivo.read()
    rut = examen.paciente.rut or f"pac{examen.paciente_id}"
    path = guardar_informe_pdf(radiologo.id, examen.derivador_id or 0, rut, examen_id, examen.tipo_examen, archivo.filename, datos)

    es_primero = not bool(examen.informes)
    informe = Informe(examen_id=examen_id, ruta_pdf=str(path), token_publico=str(uuid.uuid4()))
    db.add(informe)

    if es_primero:
        examen.estado = "COMPLETADO"
        examen.completado_en = datetime.now(timezone.utc)

    db.commit()
    db.refresh(informe)

    link_pdf = get_url(path)

    db.add(Notificacion(
        radiologo_id=radiologo.id,
        mensaje=f"Informe listo — {examen.paciente.nombre_completo} · {examen.tipo_examen}",
        derivador_id=examen.derivador_id,
        examen_id=examen_id,
    ))
    db.commit()

    return {"informe_id": informe.id, "token_publico": informe.token_publico, "link_pdf": link_pdf}


@router.delete("/{examen_id}/informes/{informe_id}", status_code=204)
def eliminar_informe(
    examen_id: int,
    informe_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    radiologo = get_tenant(request)
    examen = _examen_del_tenant(examen_id, radiologo.id, db)
    informe = db.query(Informe).filter(Informe.id == informe_id, Informe.examen_id == examen_id).first()
    if not informe:
        raise HTTPException(404)
    db.delete(informe)
    if not examen.informes or len(examen.informes) == 1:
        examen.estado = "EN_PROCESO"
        examen.completado_en = None
    db.commit()


@router.get("/{examen_id}/descargar-imagenes")
def descargar_imagenes(examen_id: int, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    e = _examen_del_tenant(examen_id, radiologo.id, db)
    rut = e.paciente.rut or f"pac{e.paciente_id}"
    imagenes = list(e.imagenes)

    def _generar():
        zf = zipstream.ZipFile(mode="w", compression=zipstream.ZIP_STORED, allowZip64=True)
        for img in imagenes:
            nombre = img.ruta.rsplit("/", 1)[-1]
            try:
                zf.write_iter(nombre, stream_bytes(img.ruta))
            except Exception:
                pass
        yield from zf

    filename = f"{rut}-{e.tipo_examen}.zip"
    return StreamingResponse(
        _generar(), media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Content-Encoding": "identity"},
    )


def _examenes_por_caso(caso_id: str, radiologo_id: int, db: Session) -> list[Examen]:
    if caso_id.startswith("solo_"):
        exam_id = int(caso_id[5:])
        e = _examen_del_tenant(exam_id, radiologo_id, db)
        return [e]
    examenes = (db.query(Examen)
                .join(Derivador, Examen.derivador_id == Derivador.id)
                .filter(Examen.caso_id == caso_id, Derivador.radiologo_id == radiologo_id)
                .all())
    if not examenes:
        raise HTTPException(404, "Caso no encontrado")
    return examenes


@router.get("/caso/{caso_id}")
def detalle_caso(caso_id: str, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    examenes = _examenes_por_caso(caso_id, radiologo.id, db)
    inc = _inc_map(db, [e.id for e in examenes])
    return {
        "examenes": [
            {
                **_serializar(e, inc.get(e.id)),
                "imagenes": [
                    {"id": img.id, "tipo": img.tipo, "nombre": img.nombre_archivo, "url": get_url(img.ruta)}
                    for img in e.imagenes
                ],
                "informes": [
                    {"id": inf.id, "nombre": inf.ruta_pdf.rsplit("/", 1)[-1], "url": get_url(inf.ruta_pdf), "token": inf.token_publico}
                    for inf in e.informes
                ],
            }
            for e in examenes
        ]
    }


@router.post("/caso/{caso_id}/notificar-derivador")
def notificar_derivador(caso_id: str, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    examenes = _examenes_por_caso(caso_id, radiologo.id, db)
    if not examenes:
        raise HTTPException(404, "Caso no encontrado")
    if not all(bool(e.informes) for e in examenes):
        raise HTTPException(400, "Faltan informes por subir")

    link_portal = _generar_link_portal(examenes[0].derivador, radiologo.slug)
    examenes_con_links = [
        {"tipo_examen": e.tipo_examen, "link_pdf": get_url(e.informes[0].ruta_pdf),
         "links_adicionales": [get_url(i.ruta_pdf) for i in e.informes[1:]]}
        for e in examenes
    ]
    ya_enviado = any(e.notificacion_derivador_enviada for e in examenes)
    ok, msg = enviar_caso_listo_a_derivador(
        examenes[0].derivador, examenes[0].paciente, examenes_con_links, link_portal,
        radiologo_nombre=radiologo.nombre_display or "Radiología",
    )
    if ok:
        for e in examenes:
            e.notificacion_derivador_enviada = True
        db.commit()
    return {"enviado": ok, "mensaje": msg, "reenvio": ya_enviado}


@router.patch("/caso/{caso_id}/estado")
def actualizar_estado_caso(caso_id: str, body: dict, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    estado = body.get("estado")
    if estado not in ESTADOS_VALIDOS:
        raise HTTPException(400, f"Estado inválido: {ESTADOS_VALIDOS}")
    radiologo = get_tenant(request)
    examenes = _examenes_por_caso(caso_id, radiologo.id, db)
    now = datetime.now(timezone.utc)
    for e in examenes:
        e.estado = estado
        if estado == "COMPLETADO":
            e.completado_en = now
    db.commit()
    return {"caso_id": caso_id, "estado": estado}


@router.get("/caso/{caso_id}/descargar")
def descargar_caso(caso_id: str, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    examenes = _examenes_por_caso(caso_id, radiologo.id, db)
    rut = examenes[0].paciente.rut or f"pac{examenes[0].paciente_id}"

    # Detectar imágenes compartidas (mismo nombre de archivo en varios exámenes)
    from collections import defaultdict
    conteo: dict[str, int] = defaultdict(int)
    for examen in examenes:
        for img in examen.imagenes:
            conteo[img.ruta.rsplit("/", 1)[-1]] += 1
    compartidas = {n for n, c in conteo.items() if c > 1}

    examenes_snap = [(e, list(e.imagenes)) for e in examenes]

    def _generar():
        zf = zipstream.ZipFile(mode="w", compression=zipstream.ZIP_STORED, allowZip64=True)
        escritas_compartidas: set[str] = set()
        for examen, imgs in examenes_snap:
            folder = examen.tipo_examen.replace("/", "-")[:40]
            propias, refs_compartidas = [], []
            for img in imgs:
                nombre = img.ruta.rsplit("/", 1)[-1]
                if nombre in compartidas:
                    refs_compartidas.append(nombre)
                    if nombre not in escritas_compartidas:
                        try:
                            zf.write_iter(f"imagenes_compartidas/{nombre}", stream_bytes(img.ruta))
                            escritas_compartidas.add(nombre)
                        except Exception:
                            pass
                else:
                    propias.append(nombre)
                    try:
                        zf.write_iter(f"{folder}/{nombre}", stream_bytes(img.ruta))
                    except Exception:
                        pass
            lineas = [f"Tipo de examen: {examen.tipo_examen}"]
            if refs_compartidas:
                lineas.append("\nImágenes compartidas:\n  → carpeta 'imagenes_compartidas/'")
                lineas.extend(f"  • {n}" for n in refs_compartidas)
            if propias:
                lineas.append("\nImágenes exclusivas:")
                lineas.extend(f"  • {n}" for n in propias)
            zf.writestr(f"{folder}/info.txt", "\n".join(lineas))
        yield from zf

    return StreamingResponse(
        _generar(), media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{rut}-caso.zip"', "Content-Encoding": "identity"},
    )


@router.get("/informe/{token}")
def ver_informe_publico(token: str, db: Session = Depends(get_db)):
    informe = db.query(Informe).filter(Informe.token_publico == token).first()
    if not informe:
        raise HTTPException(404, "Informe no encontrado")
    examen = informe.examen
    return {
        "paciente": examen.paciente.nombre_completo,
        "rut": examen.paciente.rut,
        "tipo_examen": examen.tipo_examen,
        "derivador": examen.derivador.nombre,
        "link_pdf": get_url(informe.ruta_pdf),
        "imagenes": [{"tipo": img.tipo, "url": get_url(img.ruta)} for img in examen.imagenes],
    }
