from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from core.database import get_db
from core.dependencies import get_current_user, get_portal_derivador
from core.tenant import get_tenant
from core.email_service import enviar_incidencia_a_derivador
from modulos.incidencias.models import Incidencia
from modulos.notificaciones.models import Notificacion
from modulos.examenes.models import Examen
from modulos.derivadores.models import Derivador

router = APIRouter(tags=["incidencias"])


def _serializar(inc: Incidencia) -> dict:
    return {
        "id": inc.id,
        "examen_id": inc.examen_id,
        "comentario_doctora": inc.comentario_doctora,
        "comentario_derivador": inc.comentario_derivador,
        "estado": inc.estado,
        "creado_en": inc.creado_en,
        "resuelto_en": inc.resuelto_en,
    }


# ── Doctora ───────────────────────────────────────────────────────────────────

class IncidenciaCreate(BaseModel):
    comentario_doctora: str


class IncidenciaUpdate(BaseModel):
    comentario_doctora: Optional[str] = None
    estado: Optional[str] = None


@router.post("/api/examenes/{examen_id}/incidencia", status_code=201)
def crear_incidencia(examen_id: int, body: IncidenciaCreate, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    examen = (db.query(Examen).join(Derivador, Examen.derivador_id == Derivador.id)
              .filter(Examen.id == examen_id, Derivador.radiologo_id == radiologo.id).first())
    if not examen:
        raise HTTPException(404, "Examen no encontrado")
    if db.query(Incidencia).filter(Incidencia.examen_id == examen_id).first():
        raise HTTPException(400, "Ya existe una incidencia para este examen")

    inc = Incidencia(examen_id=examen_id, comentario_doctora=body.comentario_doctora)
    db.add(inc)
    db.commit()
    db.refresh(inc)
    radiologo = get_tenant(request)
    enviar_incidencia_a_derivador(examen.derivador, examen.paciente, examen, body.comentario_doctora, radiologo_nombre=radiologo.nombre_display or "")
    return _serializar(inc)


@router.get("/api/examenes/{examen_id}/incidencia")
def get_incidencia(examen_id: int, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    examen = (db.query(Examen).join(Derivador, Examen.derivador_id == Derivador.id)
              .filter(Examen.id == examen_id, Derivador.radiologo_id == radiologo.id).first())
    if not examen:
        raise HTTPException(404, "Examen no encontrado")
    inc = db.query(Incidencia).filter(Incidencia.examen_id == examen_id).first()
    return _serializar(inc) if inc else None


@router.patch("/api/incidencias/{inc_id}")
def actualizar_incidencia(inc_id: int, body: IncidenciaUpdate, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    inc = db.query(Incidencia).filter(Incidencia.id == inc_id).first()
    if not inc:
        raise HTTPException(404, "Incidencia no encontrada")
    # Verificar pertenencia al tenant
    examen = (db.query(Examen).join(Derivador, Examen.derivador_id == Derivador.id)
              .filter(Examen.id == inc.examen_id, Derivador.radiologo_id == radiologo.id).first())
    if not examen:
        raise HTTPException(403, "Sin permiso")
    if body.comentario_doctora is not None:
        inc.comentario_doctora = body.comentario_doctora
    if body.estado == "ABIERTA":
        inc.estado = "ABIERTA"
        inc.resuelto_en = None
    db.commit()
    db.refresh(inc)
    return _serializar(inc)


# ── Portal derivador ──────────────────────────────────────────────────────────

@router.get("/api/portal/examenes/{examen_id}/incidencia")
def portal_get_incidencia(examen_id: int, derivador: Derivador = Depends(get_portal_derivador), db: Session = Depends(get_db)):
    examen = db.query(Examen).filter(Examen.id == examen_id, Examen.derivador_id == derivador.id).first()
    if not examen:
        raise HTTPException(404, "Examen no encontrado")
    inc = db.query(Incidencia).filter(Incidencia.examen_id == examen_id).first()
    return _serializar(inc) if inc else None


class ResolverBody(BaseModel):
    comentario_derivador: Optional[str] = None


@router.post("/api/portal/incidencias/{inc_id}/resolver")
def portal_resolver(inc_id: int, body: ResolverBody, derivador: Derivador = Depends(get_portal_derivador), db: Session = Depends(get_db)):
    inc = db.query(Incidencia).filter(Incidencia.id == inc_id).first()
    if not inc:
        raise HTTPException(404, "Incidencia no encontrada")
    if inc.examen.derivador_id != derivador.id:
        raise HTTPException(403, "Sin permiso")
    inc.estado = "RESUELTA"
    inc.comentario_derivador = body.comentario_derivador
    inc.resuelto_en = datetime.now(timezone.utc)
    paciente = inc.examen.paciente
    db.add(Notificacion(
        radiologo_id=derivador.radiologo_id,
        mensaje=f"Incidencia resuelta por {derivador.nombre} · {paciente.nombre_completo} · {inc.examen.tipo_examen}",
    ))
    db.commit()
    db.refresh(inc)
    return _serializar(inc)


# ── Notificaciones doctora ────────────────────────────────────────────────────

@router.get("/api/notificaciones")
def listar_notificaciones(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    return (db.query(Notificacion)
            .filter(Notificacion.radiologo_id == radiologo.id, Notificacion.derivador_id == None)
            .order_by(Notificacion.creado_en.desc()).limit(50).all())


@router.post("/api/notificaciones/leer-todas", status_code=204)
def leer_todas(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    db.query(Notificacion).filter(
        Notificacion.radiologo_id == radiologo.id,
        Notificacion.derivador_id == None,
        Notificacion.leida == False,
    ).update({"leida": True})
    db.commit()
