"""
Endpoints internos — solo accesibles con X-Cron-Secret.
Llamados por el cron del VPS, no expuestos al exterior.
"""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.config import settings
from core.database import get_db

router = APIRouter(prefix="/api/interno", tags=["interno"])

CRON_SECRET = settings.SECRET_KEY  # reutilizamos SECRET_KEY; puedes añadir CRON_SECRET al .env


def _verificar_secret(x_cron_secret: str = Header(...)):
    if x_cron_secret != CRON_SECRET:
        raise HTTPException(403, "Forbidden")


@router.post("/archivar-casos-antiguos", dependencies=[Depends(_verificar_secret)])
def archivar_casos_antiguos(db: Session = Depends(get_db)):
    """
    Busca un caso completado cuyo ultimo_acceso_en (o notificacion enviada)
    sea hace más de 30 días y no esté archivado.
    Usa SELECT FOR UPDATE SKIP LOCKED para seguridad ante múltiples workers.
    Procesa UN caso por llamada (el cron llama repetidamente si hay varios).
    """
    from core.archivado import archivar_caso_completo
    from modulos.examenes.models import Examen
    from modulos.derivadores.models import Derivador

    limite = datetime.now(timezone.utc) - timedelta(days=30)

    # Buscar un caso_id elegible de forma atómica con SKIP LOCKED
    resultado = db.execute(text("""
        SELECT DISTINCT ON (caso_id) caso_id
        FROM examenes
        WHERE estado = 'COMPLETADO'
          AND notificacion_derivador_enviada = true
          AND (archivo_estado IS NULL OR archivo_estado = 'dicom_archivado')
          AND (
              ultimo_acceso_en < :limite
              OR (ultimo_acceso_en IS NULL AND completado_en < :limite)
          )
        ORDER BY caso_id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    """), {"limite": limite}).fetchone()

    if not resultado:
        return {"archivado": False, "mensaje": "Sin casos elegibles"}

    caso_id = resultado[0]
    examenes = db.query(Examen).filter(Examen.caso_id == caso_id).all()
    if not examenes:
        return {"archivado": False, "mensaje": "Caso no encontrado"}

    try:
        archivar_caso_completo(caso_id, examenes, db)
        return {"archivado": True, "caso_id": caso_id}
    except Exception as exc:
        db.rollback()
        return {"archivado": False, "caso_id": caso_id, "error": str(exc)}
