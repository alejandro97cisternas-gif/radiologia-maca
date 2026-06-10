from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from core.database import seed_superadmin
from core.config import settings
from core.tenant import TenantMiddleware
from api.routers import auth, derivadores, portal, examenes, dashboard, honorarios, incidencias, admin

app = FastAPI(
    title="Gestión Informes Maca",
    version="1.0.0",
)

def _allowed_origin(origin: str) -> bool:
    allowed = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
    ]
    if origin in allowed:
        return True
    # Permitir cualquier subdominio del dominio base
    base = settings.BASE_DOMAIN
    return origin.endswith(f".{base}") or origin in (f"https://{base}", f"http://{base}")

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(TenantMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=rf"https?://(localhost(:\d+)?|.*\.{settings.BASE_DOMAIN.replace('.', r'\.')}|{settings.BASE_DOMAIN.replace('.', r'\.')})",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Token-Refresh"],
)

if settings.STORAGE_BACKEND == "local":
    from fastapi.staticfiles import StaticFiles
    from core.storage import STORAGE_ROOT
    STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(STORAGE_ROOT)), name="static")

app.include_router(auth.router)
app.include_router(derivadores.router)
app.include_router(portal.router)
app.include_router(examenes.router)
app.include_router(dashboard.router)
app.include_router(honorarios.router)
app.include_router(incidencias.router)
app.include_router(admin.router)


@app.on_event("startup")
def startup():
    seed_superadmin()


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}
