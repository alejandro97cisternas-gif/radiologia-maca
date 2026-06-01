import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from core.database import get_db
from core.dependencies import get_superadmin
from modulos.usuarios.models import Usuario
from modulos.derivadores.models import Derivador
from modulos.examenes.models import Examen

router = APIRouter(prefix="/api/admin", tags=["admin"])


class RadiologoCreate(BaseModel):
    username: str
    password: str
    slug: str
    nombre_display: str
    email: str


class RadiologoUpdate(BaseModel):
    nombre_display: Optional[str] = None
    email: Optional[str] = None
    slug: Optional[str] = None
    activo: Optional[bool] = None


class RadiologoResponse(BaseModel):
    id: int
    username: str
    slug: Optional[str]
    nombre_display: Optional[str]
    email: Optional[str]
    activo: bool
    stats: Optional[dict] = None

    class Config:
        from_attributes = True


@router.get("/radiologos")
def listar_radiologos(db: Session = Depends(get_db), _=Depends(get_superadmin)):
    radiologos = db.query(Usuario).filter(Usuario.rol == "radiologo").order_by(Usuario.nombre_display).all()
    result = []
    for r in radiologos:
        n_derivadores = db.query(Derivador).filter(Derivador.radiologo_id == r.id, Derivador.activo == True).count()
        n_examenes = (db.query(Examen)
                      .join(Derivador, Examen.derivador_id == Derivador.id)
                      .filter(Derivador.radiologo_id == r.id).count())
        result.append({
            "id": r.id,
            "username": r.username,
            "slug": r.slug,
            "nombre_display": r.nombre_display,
            "email": r.email,
            "activo": r.activo,
            "creado_en": r.creado_en,
            "stats": {"derivadores": n_derivadores, "examenes": n_examenes},
        })
    return result


@router.post("/radiologos", status_code=201)
def crear_radiologo(body: RadiologoCreate, db: Session = Depends(get_db), _=Depends(get_superadmin)):
    slug = body.slug.strip().lower()
    if db.query(Usuario).filter(Usuario.username == body.username).first():
        raise HTTPException(409, "Username ya existe")
    if db.query(Usuario).filter(Usuario.slug == slug).first():
        raise HTTPException(409, "Slug ya existe — elige otro subdominio")

    hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    radiologo = Usuario(
        username=body.username,
        password_hash=hashed,
        rol="radiologo",
        slug=slug,
        nombre_display=body.nombre_display.strip(),
        email=body.email.strip().lower(),
        activo=True,
    )
    db.add(radiologo)
    db.commit()
    db.refresh(radiologo)
    return {"id": radiologo.id, "username": radiologo.username, "slug": radiologo.slug, "nombre_display": radiologo.nombre_display}


@router.patch("/radiologos/{id}")
def actualizar_radiologo(id: int, body: RadiologoUpdate, db: Session = Depends(get_db), _=Depends(get_superadmin)):
    radiologo = db.query(Usuario).filter(Usuario.id == id, Usuario.rol == "radiologo").first()
    if not radiologo:
        raise HTTPException(404, "Radiólogo no encontrado")

    if body.slug is not None:
        slug = body.slug.strip().lower()
        conflict = db.query(Usuario).filter(Usuario.slug == slug, Usuario.id != id).first()
        if conflict:
            raise HTTPException(409, "Slug ya existe")
        radiologo.slug = slug
    if body.nombre_display is not None:
        radiologo.nombre_display = body.nombre_display.strip()
    if body.email is not None:
        radiologo.email = body.email.strip().lower()
    if body.activo is not None:
        radiologo.activo = body.activo

    db.commit()
    db.refresh(radiologo)
    return {"id": radiologo.id, "slug": radiologo.slug, "activo": radiologo.activo}


@router.post("/radiologos/{id}/reset-password")
def reset_password(id: int, body: dict, db: Session = Depends(get_db), _=Depends(get_superadmin)):
    nueva = body.get("password", "")
    if len(nueva) < 8:
        raise HTTPException(400, "La contraseña debe tener al menos 8 caracteres")
    radiologo = db.query(Usuario).filter(Usuario.id == id, Usuario.rol == "radiologo").first()
    if not radiologo:
        raise HTTPException(404, "Radiólogo no encontrado")
    radiologo.password_hash = bcrypt.hashpw(nueva.encode(), bcrypt.gensalt()).decode()
    db.commit()
    return {"ok": True}
