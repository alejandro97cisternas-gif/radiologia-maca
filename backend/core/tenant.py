from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from core.config import settings
from core.database import SessionLocal
from modulos.usuarios.models import Usuario

TENANT_ATTR = "radiologo"


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # Preflight CORS siempre pasa
        if request.method == "OPTIONS":
            return await call_next(request)

        # Rutas que no necesitan tenant (superadmin, health, auth pública)
        path = request.url.path
        if _es_ruta_global(path):
            return await call_next(request)

        slug = _extraer_slug(request)
        if not slug:
            raise HTTPException(status_code=404, detail="Tenant no identificado")

        db = SessionLocal()
        try:
            radiologo = db.query(Usuario).filter(
                Usuario.slug == slug,
                Usuario.rol == "radiologo",
                Usuario.activo == True,
            ).first()
        finally:
            db.close()

        if not radiologo:
            raise HTTPException(status_code=404, detail=f"Radiólogo '{slug}' no encontrado")

        request.state.radiologo = radiologo
        request.state.radiologo_id = radiologo.id
        return await call_next(request)


def _extraer_slug(request: Request) -> str | None:
    # 1. Header explícito (dev local / frontend)
    slug = request.headers.get("X-Tenant-Slug", "").strip()
    if slug:
        return slug

    # 2. Subdominio del Host header (producción — Nginx pasa el host original)
    host = (
        request.headers.get("X-Forwarded-Host")
        or request.headers.get("host")
        or ""
    ).split(":")[0].strip()

    base = settings.BASE_DOMAIN
    if host.endswith(f".{base}") and host != f"admin.{base}":
        return host[: -(len(base) + 1)]

    return None


def _es_ruta_global(path: str) -> bool:
    prefijos_globales = (
        "/api/admin",
        "/api/auth/admin",
        "/api/health",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/static",
    )
    return any(path.startswith(p) for p in prefijos_globales)


def get_tenant(request: Request) -> Usuario:
    radiologo = getattr(request.state, TENANT_ATTR, None)
    if not radiologo:
        raise HTTPException(status_code=400, detail="Contexto de tenant no disponible")
    return radiologo
