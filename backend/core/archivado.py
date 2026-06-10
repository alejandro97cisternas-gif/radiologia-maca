"""
Servicio de archivado de casos.

Fases:
  1. archivar_dicoms_caso   — archiva solo DICOMs (cuando doctora envía informe)
  2. archivar_caso_completo — archiva todo (cron 30 días tras notificación)
  desarchivar_caso          — restaura archivos individuales desde el ZIP
"""
import io
import logging
import tempfile
import zipfile
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from core.storage import _r2_client, _is_r2, get_bytes, _r2_upload, settings
from modulos.examenes.models import Examen

logger = logging.getLogger(__name__)


# ── helpers R2 ────────────────────────────────────────────────────────────────

def _download_bytes(key: str) -> bytes:
    return get_bytes(key)


def _upload_bytes(key: str, data: bytes) -> None:
    _r2_upload(key, data, "application/zip")


def _object_exists(key: str) -> bool:
    try:
        _r2_client().head_object(Bucket=settings.R2_BUCKET, Key=key)
        return True
    except Exception:
        return False


def _delete_objects(keys: list[str]) -> None:
    if not keys:
        return
    client = _r2_client()
    bucket = settings.R2_BUCKET
    for i in range(0, len(keys), 1000):
        batch = [{"Key": k} for k in keys[i:i + 1000]]
        client.delete_objects(Bucket=bucket, Delete={"Objects": batch})


# ── fase 1: archivar solo DICOMs ──────────────────────────────────────────────

def archivar_dicoms_caso(caso_id: str, examenes: list[Examen], db: Session) -> bool:
    """
    Comprime todos los DICOMs del caso en un ZIP y borra los originales.
    Devuelve True si había DICOMs y se archivaron.
    """
    dicom_images = [
        img for e in examenes
        for img in e.imagenes if img.tipo == "DICOM"
    ]
    if not dicom_images:
        return False

    zip_key = f"archivos/dicom-{caso_id}.zip"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for img in dicom_images:
            try:
                data = _download_bytes(img.ruta)
                zf.writestr(img.ruta, data)
            except Exception as exc:
                logger.error("Error descargando %s para ZIP: %s", img.ruta, exc)
                raise

    buf.seek(0)
    zip_bytes = buf.read()
    _upload_bytes(zip_key, zip_bytes)

    if not _object_exists(zip_key):
        raise RuntimeError(f"ZIP no encontrado tras subir: {zip_key}")

    keys_a_borrar = [img.ruta for img in dicom_images]
    _delete_objects(keys_a_borrar)

    now = datetime.now(timezone.utc)
    for e in examenes:
        has_dicom = any(i.tipo == "DICOM" for i in e.imagenes)
        if has_dicom:
            e.archivo_estado = "dicom_archivado"
            e.archivado_en = now
            e.ruta_zip = zip_key
    db.commit()
    return True


# ── fase 2: archivar todo ─────────────────────────────────────────────────────

def archivar_caso_completo(caso_id: str, examenes: list[Examen], db: Session) -> bool:
    """
    Comprime TODAS las imágenes e informes del caso en un ZIP único y borra originales.
    """
    zip_key = f"archivos/completo-{caso_id}.zip"

    # Recopilar rutas: imágenes + informes (excluir ya archivados en dicom_archivado)
    rutas: list[str] = []
    for e in examenes:
        for img in e.imagenes:
            if img.tipo != "DICOM" or e.archivo_estado != "dicom_archivado":
                rutas.append(img.ruta)
        for inf in e.informes:
            rutas.append(inf.ruta_pdf)

    # Si hay DICOMs ya archivados en fase 1, incluir ese ZIP dentro del completo
    dicom_zip_keys = list({
        e.ruta_zip for e in examenes
        if e.archivo_estado == "dicom_archivado" and e.ruta_zip
    })

    if not rutas and not dicom_zip_keys:
        return False

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for ruta in rutas:
            try:
                data = _download_bytes(ruta)
                zf.writestr(ruta, data)
            except Exception as exc:
                logger.error("Error descargando %s: %s", ruta, exc)
                raise
        # inlinar los DICOMs del ZIP parcial
        for dzip_key in dicom_zip_keys:
            try:
                dzip_bytes = _download_bytes(dzip_key)
                with zipfile.ZipFile(io.BytesIO(dzip_bytes)) as inner:
                    for name in inner.namelist():
                        zf.writestr(name, inner.read(name))
            except Exception as exc:
                logger.error("Error leyendo ZIP parcial %s: %s", dzip_key, exc)
                raise

    buf.seek(0)
    _upload_bytes(zip_key, buf.read())

    if not _object_exists(zip_key):
        raise RuntimeError(f"ZIP completo no encontrado tras subir: {zip_key}")

    _delete_objects(rutas)
    if dicom_zip_keys:
        _delete_objects(dicom_zip_keys)

    now = datetime.now(timezone.utc)
    for e in examenes:
        e.archivo_estado = "archivado"
        e.archivado_en = now
        e.ruta_zip = zip_key
    db.commit()
    return True


# ── desarchivar ───────────────────────────────────────────────────────────────

def desarchivar_caso(caso_id: str, examenes: list[Examen], db: Session) -> bool:
    """
    Extrae el ZIP completo o DICOM y restaura cada archivo a su ruta original en R2.
    """
    zip_keys = list({e.ruta_zip for e in examenes if e.ruta_zip})
    if not zip_keys:
        return False

    for zip_key in zip_keys:
        zip_bytes = _download_bytes(zip_key)
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for name in zf.namelist():
                data = zf.read(name)
                ct = "application/octet-stream"
                if name.endswith(".pdf"):
                    ct = "application/pdf"
                elif name.lower().endswith((".jpg", ".jpeg")):
                    ct = "image/jpeg"
                elif name.lower().endswith(".png"):
                    ct = "image/png"
                _r2_upload(name, data, ct)
        _delete_objects([zip_key])

    for e in examenes:
        e.archivo_estado = None
        e.archivado_en = None
        e.ruta_zip = None
    db.commit()
    return True
