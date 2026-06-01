import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from core.database import get_db
from core.security import crear_token
from core.dependencies import get_current_user, get_superadmin
from core.tenant import get_tenant
from modulos.usuarios.models import Usuario

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=LoginResponse)
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    radiologo = get_tenant(request)
    usuario = db.query(Usuario).filter(
        Usuario.username == body.username,
        Usuario.id == radiologo.id,
        Usuario.activo == True,
    ).first()
    if not usuario or not bcrypt.checkpw(body.password.encode(), usuario.password_hash.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas")
    token = crear_token({"sub": str(usuario.id), "tipo": "doctora"})
    return LoginResponse(access_token=token)


@router.get("/me")
def me(usuario: Usuario = Depends(get_current_user)):
    return {
        "id": usuario.id,
        "username": usuario.username,
        "nombre_display": usuario.nombre_display,
        "slug": usuario.slug,
    }


# ── Superadmin auth (ruta global, no pasa por TenantMiddleware) ───────────────

@router.post("/admin/login", response_model=LoginResponse)
def admin_login(body: LoginRequest, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(
        Usuario.username == body.username,
        Usuario.rol == "superadmin",
        Usuario.activo == True,
    ).first()
    if not usuario or not bcrypt.checkpw(body.password.encode(), usuario.password_hash.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas")
    token = crear_token({"sub": str(usuario.id), "tipo": "superadmin"})
    return LoginResponse(access_token=token)


@router.get("/admin/me")
def admin_me(usuario: Usuario = Depends(get_superadmin)):
    return {"id": usuario.id, "username": usuario.username, "email": usuario.email}
