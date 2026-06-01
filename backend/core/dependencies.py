from datetime import datetime, timezone
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from core.database import get_db
from core.security import verificar_token, crear_token
from core.tenant import get_tenant
from modulos.usuarios.models import Usuario
from modulos.derivadores.models import Derivador

bearer = HTTPBearer()

_PORTAL_EXPIRES_MINUTES = 60 * 24 * 7
_REFRESH_THRESHOLD_SECONDS = 3 * 24 * 3600


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    payload = verificar_token(credentials.credentials)
    if payload.get("tipo") != "doctora":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token no es de doctora")

    radiologo = get_tenant(request)
    usuario = db.query(Usuario).filter(
        Usuario.id == int(payload["sub"]),
        Usuario.id == radiologo.id,
        Usuario.activo == True,
    ).first()
    if not usuario:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")
    return usuario


def get_portal_derivador(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
    response: Response = None,
) -> Derivador:
    payload = verificar_token(credentials.credentials)
    if payload.get("tipo") != "portal":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token no es de portal")

    radiologo = get_tenant(request)
    derivador = db.query(Derivador).filter(
        Derivador.id == int(payload["sub"]),
        Derivador.radiologo_id == radiologo.id,
        Derivador.activo == True,
    ).first()
    if not derivador:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Derivador no encontrado")

    # Sliding window
    exp = payload.get("exp", 0)
    if response and (exp - datetime.now(timezone.utc).timestamp()) < _REFRESH_THRESHOLD_SECONDS:
        new_token = crear_token({"sub": str(derivador.id), "tipo": "portal"}, expires_minutes=_PORTAL_EXPIRES_MINUTES)
        response.headers["X-Token-Refresh"] = new_token

    return derivador


def get_superadmin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    payload = verificar_token(credentials.credentials)
    if payload.get("tipo") != "superadmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Se requiere superadmin")
    usuario = db.query(Usuario).filter(
        Usuario.id == int(payload["sub"]),
        Usuario.rol == "superadmin",
        Usuario.activo == True,
    ).first()
    if not usuario:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin no encontrado")
    return usuario
