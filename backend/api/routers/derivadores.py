import uuid
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from core.database import get_db
from core.dependencies import get_current_user
from core.tenant import get_tenant
from core.email_service import enviar_magic_link_portal
from core.config import settings
from core.slugify import slugify
from modulos.derivadores.models import Derivador

router = APIRouter(prefix="/api/derivadores", tags=["derivadores"])


class DerivadorCreate(BaseModel):
    nombre: str
    email: str
    telefono: str | None = None
    color: str = "#6b7280"
    moneda: str = "CLP"


class DerivadorUpdate(BaseModel):
    nombre: str | None = None
    email: str | None = None
    telefono: str | None = None
    activo: bool | None = None
    color: str | None = None
    moneda: str | None = None


class DerivadorResponse(BaseModel):
    id: int
    nombre: str
    email: str
    telefono: str | None
    activo: bool
    color: str | None = "#6b7280"
    moneda: str = "CLP"
    portal_slug: str | None = None
    portal_token: str | None = None

    class Config:
        from_attributes = True


@router.get("", response_model=list[DerivadorResponse])
def listar(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    return db.query(Derivador).filter(Derivador.radiologo_id == radiologo.id).order_by(Derivador.nombre).all()


def _generar_portal_slug(nombre: str, radiologo_id: int, db: Session, exclude_id: int | None = None) -> str:
    base = slugify(nombre)
    slug = base
    count = 1
    while True:
        q = db.query(Derivador).filter(
            Derivador.radiologo_id == radiologo_id,
            Derivador.portal_slug == slug,
        )
        if exclude_id:
            q = q.filter(Derivador.id != exclude_id)
        if not q.first():
            return slug
        count += 1
        slug = f"{base}-{count}"


@router.post("", response_model=DerivadorResponse, status_code=201)
def crear(body: DerivadorCreate, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    slug = _generar_portal_slug(body.nombre, radiologo.id, db)
    derivador = Derivador(
        **body.model_dump(),
        radiologo_id=radiologo.id,
        portal_token=str(uuid.uuid4()),
        portal_slug=slug,
    )
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


def _portal_url(derivador: Derivador, radiologo_slug: str) -> str:
    return f"https://{radiologo_slug}.{settings.BASE_DOMAIN}/portal/acceder/{derivador.portal_slug}?t={derivador.portal_token}"


@router.post("/{id}/activar", status_code=204)
def activar(id: int, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    derivador = db.query(Derivador).filter(Derivador.id == id, Derivador.radiologo_id == radiologo.id).first()
    if not derivador:
        raise HTTPException(404, "Derivador no encontrado")
    derivador.activo = True
    db.commit()


@router.post("/{id}/magic-link")
def generar_magic_link(id: int, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    derivador = db.query(Derivador).filter(Derivador.id == id, Derivador.radiologo_id == radiologo.id, Derivador.activo == True).first()
    if not derivador:
        raise HTTPException(404, "Derivador no encontrado")

    url = _portal_url(derivador, radiologo.slug)
    ok, msg = enviar_magic_link_portal(derivador, url, radiologo_nombre=radiologo.nombre_display or "Radiología")
    return {"url": url, "email_enviado": ok, "mensaje": msg}


@router.post("/{id}/regenerar-token")
def regenerar_token(id: int, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    derivador = db.query(Derivador).filter(Derivador.id == id, Derivador.radiologo_id == radiologo.id, Derivador.activo == True).first()
    if not derivador:
        raise HTTPException(404, "Derivador no encontrado")
    derivador.portal_token = str(uuid.uuid4())
    db.commit()
    return {"url": _portal_url(derivador, radiologo.slug)}
