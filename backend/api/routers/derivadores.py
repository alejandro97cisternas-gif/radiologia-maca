import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from core.database import get_db
from core.dependencies import get_current_user
from core.tenant import get_tenant
from core.email_service import enviar_magic_link_portal
from core.config import settings
from modulos.derivadores.models import Derivador, PortalMagicLink

router = APIRouter(prefix="/api/derivadores", tags=["derivadores"])


class DerivadorCreate(BaseModel):
    nombre: str
    email: str
    telefono: str | None = None
    color: str = "#6b7280"


class DerivadorUpdate(BaseModel):
    nombre: str | None = None
    email: str | None = None
    telefono: str | None = None
    activo: bool | None = None
    color: str | None = None


class DerivadorResponse(BaseModel):
    id: int
    nombre: str
    email: str
    telefono: str | None
    activo: bool
    color: str | None = "#6b7280"

    class Config:
        from_attributes = True


@router.get("", response_model=list[DerivadorResponse])
def listar(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    return db.query(Derivador).filter(Derivador.radiologo_id == radiologo.id).order_by(Derivador.nombre).all()


@router.post("", response_model=DerivadorResponse, status_code=201)
def crear(body: DerivadorCreate, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    derivador = Derivador(**body.model_dump(), radiologo_id=radiologo.id)
    db.add(derivador)
    db.commit()
    db.refresh(derivador)
    return derivador


@router.patch("/{id}", response_model=DerivadorResponse)
def actualizar(id: int, body: DerivadorUpdate, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    derivador = db.query(Derivador).filter(Derivador.id == id, Derivador.radiologo_id == radiologo.id).first()
    if not derivador:
        raise HTTPException(404, "Derivador no encontrado")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(derivador, field, value)
    db.commit()
    db.refresh(derivador)
    return derivador


@router.delete("/{id}", status_code=204)
def eliminar(id: int, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    derivador = db.query(Derivador).filter(Derivador.id == id, Derivador.radiologo_id == radiologo.id).first()
    if not derivador:
        raise HTTPException(404, "Derivador no encontrado")
    derivador.activo = False
    db.commit()


@router.post("/{id}/magic-link")
def generar_magic_link(id: int, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    derivador = db.query(Derivador).filter(Derivador.id == id, Derivador.radiologo_id == radiologo.id, Derivador.activo == True).first()
    if not derivador:
        raise HTTPException(404, "Derivador no encontrado")

    db.query(PortalMagicLink).filter(PortalMagicLink.derivador_id == id, PortalMagicLink.activo == True).update({"activo": False})

    token = str(uuid.uuid4())
    db.add(PortalMagicLink(derivador_id=id, token=token, expira_en=datetime.utcnow() + timedelta(hours=24)))
    db.commit()

    url = f"https://{radiologo.slug}.{settings.BASE_DOMAIN}/portal/acceder?token={token}"
    ok, msg = enviar_magic_link_portal(derivador, url, radiologo_nombre=radiologo.nombre_display or "Radiología")
    return {"url": url, "email_enviado": ok, "mensaje": msg}
