"""
Storage backend abstraction.

STORAGE_BACKEND=local  → archivos en disco, servidos via /static
STORAGE_BACKEND=r2     → Cloudflare R2, URLs firmadas con expiración

Las funciones públicas siempre retornan un `key` (str) — el path relativo
dentro del bucket o del STORAGE_ROOT. Se guarda en DB como `img.ruta`.
Usar `get_url(key)` para obtener la URL servible.
"""
from __future__ import annotations
from pathlib import Path
from functools import lru_cache
from core.config import settings
from core.slugify import slugify

STORAGE_ROOT = Path(settings.STORAGE_ROOT)

EXAMENES_2D = {"PANO", "RETRO", "BW-UNI", "BW-BIL", "TELE-L", "TELE-F", "ORTO", "CARP", "CEF-AN"}
EXAMENES_3D = {"CBCT-LOC", "CBCT-SUP", "CBCT-INF", "CBCT-BI", "CBCT-STE", "CBCT-ATM"}


def dimension(tipo_examen: str) -> str:
    return "3D" if tipo_examen in EXAMENES_3D else "2D"


def _carpeta_paciente(paciente_id: int, nombre_paciente: str) -> str:
    """Carpeta única y legible: '{id}_{nombre-slug}' — nunca depende del RUT."""
    return f"{paciente_id}_{slugify(nombre_paciente)[:30]}"


def _key_base(radiologo_id: int, derivador_id: int, paciente_id: int, nombre_paciente: str,
              orden_id: int, tipo_examen: str, dim: str | None = None) -> str:
    d = dim or dimension(tipo_examen)
    carpeta = _carpeta_paciente(paciente_id, nombre_paciente)
    return f"{radiologo_id}/{derivador_id}/{carpeta}/ordenes/{orden_id}/{d}/{tipo_examen}"


# ── Backend R2 ────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _r2_client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY,
        aws_secret_access_key=settings.R2_SECRET_KEY,
        region_name="auto",
    )


def _r2_upload(key: str, datos: bytes, content_type: str = "application/octet-stream") -> None:
    _r2_client().put_object(
        Bucket=settings.R2_BUCKET,
        Key=key,
        Body=datos,
        ContentType=content_type,
    )


def _r2_upload_file(key: str, archivo: Path, content_type: str = "application/octet-stream") -> None:
    """Upload streaming desde disco — no carga el archivo en RAM."""
    with open(archivo, "rb") as f:
        _r2_client().upload_fileobj(
            f, settings.R2_BUCKET, key,
            ExtraArgs={"ContentType": content_type},
        )


def guardar_desde_archivo(key: str, archivo: Path, content_type: str = "application/octet-stream") -> str:
    """Guarda un archivo ya en disco a storage sin cargarlo en RAM."""
    if _is_r2():
        _r2_upload_file(key, archivo, content_type)
    else:
        import shutil as _sh
        dst = STORAGE_ROOT / key
        dst.parent.mkdir(parents=True, exist_ok=True)
        _sh.copy2(archivo, dst)
    return key


def key_dicom(radiologo_id: int, derivador_id: int, paciente_id: int, nombre_paciente: str,
              orden_id: int, tipo_examen: str, nombre: str,
              ubicacion: str = "", dim: str | None = None) -> str:
    sub = f"dicom/{ubicacion}/{nombre}" if ubicacion else f"dicom/{nombre}"
    return f"{_key_base(radiologo_id, derivador_id, paciente_id, nombre_paciente, orden_id, tipo_examen, dim)}/imagen/{sub}"


def key_imagen_2d(radiologo_id: int, derivador_id: int, paciente_id: int, nombre_paciente: str,
                  orden_id: int, tipo_examen: str, nombre: str, dim: str | None = None) -> str:
    return f"{_key_base(radiologo_id, derivador_id, paciente_id, nombre_paciente, orden_id, tipo_examen, dim)}/imagen/{nombre}"


def key_preview_3d(radiologo_id: int, derivador_id: int, paciente_id: int, nombre_paciente: str,
                   orden_id: int, tipo_examen: str, nombre: str, dim: str | None = None) -> str:
    return f"{_key_base(radiologo_id, derivador_id, paciente_id, nombre_paciente, orden_id, tipo_examen, dim)}/imagen/preview/{nombre}"


def _r2_delete_prefix(prefix: str) -> None:
    client = _r2_client()
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=settings.R2_BUCKET, Prefix=prefix):
        objects = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
        if objects:
            client.delete_objects(Bucket=settings.R2_BUCKET, Delete={"Objects": objects})


def _r2_list_prefix(prefix: str) -> list[str]:
    client = _r2_client()
    paginator = client.get_paginator("list_objects_v2")
    keys = []
    for page in paginator.paginate(Bucket=settings.R2_BUCKET, Prefix=prefix):
        keys.extend(obj["Key"] for obj in page.get("Contents", []))
    return keys


# ── Backend local ─────────────────────────────────────────────────────────────

def _local_write(key: str, datos: bytes) -> None:
    path = STORAGE_ROOT / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(datos)


def _local_list_prefix(prefix: str) -> list[str]:
    base = STORAGE_ROOT / prefix
    if not base.exists():
        return []
    return [
        str(f.relative_to(STORAGE_ROOT)).replace("\\", "/")
        for f in base.rglob("*") if f.is_file()
    ]


# ── API pública ───────────────────────────────────────────────────────────────

def _is_r2() -> bool:
    return settings.STORAGE_BACKEND == "r2"


def _mime(nombre: str) -> str:
    ext = nombre.rsplit(".", 1)[-1].lower()
    return {"dcm": "application/dicom", "pdf": "application/pdf",
            "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}.get(ext, "application/octet-stream")


def guardar_imagen_2d(radiologo_id: int, derivador_id: int, paciente_id: int, nombre_paciente: str,
                      orden_id: int, tipo_examen: str, nombre: str, datos: bytes,
                      dim: str | None = None) -> str:
    key = f"{_key_base(radiologo_id, derivador_id, paciente_id, nombre_paciente, orden_id, tipo_examen, dim)}/imagen/{nombre}"
    if _is_r2():
        _r2_upload(key, datos, _mime(nombre))
    else:
        _local_write(key, datos)
    return key


def guardar_dicom(radiologo_id: int, derivador_id: int, paciente_id: int, nombre_paciente: str,
                  orden_id: int, tipo_examen: str, nombre: str, datos: bytes,
                  ubicacion: str = "", dim: str | None = None) -> str:
    sub = f"dicom/{ubicacion}/{nombre}" if ubicacion else f"dicom/{nombre}"
    key = f"{_key_base(radiologo_id, derivador_id, paciente_id, nombre_paciente, orden_id, tipo_examen, dim)}/imagen/{sub}"
    if _is_r2():
        _r2_upload(key, datos, "application/dicom")
    else:
        _local_write(key, datos)
    return key


def guardar_preview_3d(radiologo_id: int, derivador_id: int, paciente_id: int, nombre_paciente: str,
                       orden_id: int, tipo_examen: str, nombre: str, datos: bytes,
                       dim: str | None = None) -> str:
    key = f"{_key_base(radiologo_id, derivador_id, paciente_id, nombre_paciente, orden_id, tipo_examen, dim)}/imagen/preview/{nombre}"
    if _is_r2():
        _r2_upload(key, datos, _mime(nombre))
    else:
        _local_write(key, datos)
    return key


def guardar_informe_pdf(radiologo_id: int, derivador_id: int, paciente_id: int, nombre_paciente: str,
                        orden_id: int, tipo_examen: str, nombre: str, datos: bytes,
                        dim: str | None = None) -> str:
    d = dim or dimension(tipo_examen)
    carpeta = _carpeta_paciente(paciente_id, nombre_paciente)
    key = f"{radiologo_id}/{derivador_id}/{carpeta}/ordenes/{orden_id}/{d}/{tipo_examen}/informe/{nombre}"
    if _is_r2():
        _r2_upload(key, datos, "application/pdf")
    else:
        _local_write(key, datos)
    return key


def listar_archivos_examen(radiologo_id: int, derivador_id: int, paciente_id: int, nombre_paciente: str,
                           orden_id: int, tipo_examen: str, dim: str | None = None) -> list[dict]:
    d = dim or dimension(tipo_examen)
    prefix = f"{_key_base(radiologo_id, derivador_id, paciente_id, nombre_paciente, orden_id, tipo_examen, d)}/imagen"
    keys = _r2_list_prefix(prefix) if _is_r2() else _local_list_prefix(prefix)

    result = []
    for k in sorted(keys):
        nombre = k.rsplit("/", 1)[-1]
        if "/dicom/" in k:
            subtipo = "dicom"
        elif "/preview/" in k:
            subtipo = "preview"
        else:
            subtipo = "imagen"
        result.append({"nombre": nombre, "subtipo": subtipo, "key": k})
    return result


def eliminar_carpeta_examen(radiologo_id: int, derivador_id: int, paciente_id: int,
                             nombre_paciente: str, examen_id: int) -> None:
    carpeta = _carpeta_paciente(paciente_id, nombre_paciente)
    prefix = f"{radiologo_id}/{derivador_id}/{carpeta}/ordenes/{examen_id}"
    if _is_r2():
        _r2_delete_prefix(prefix)
    else:
        import shutil
        carpeta_path = STORAGE_ROOT / prefix
        if carpeta_path.exists():
            shutil.rmtree(carpeta_path, ignore_errors=True)


def iniciar_multipart(key: str, content_type: str = "application/octet-stream") -> str:
    resp = _r2_client().create_multipart_upload(
        Bucket=settings.R2_BUCKET, Key=key, ContentType=content_type
    )
    return resp["UploadId"]


def presign_parte(key: str, upload_id: str, part_number: int, expiry: int = 7200) -> str:
    return _r2_client().generate_presigned_url(
        "upload_part",
        Params={"Bucket": settings.R2_BUCKET, "Key": key, "UploadId": upload_id, "PartNumber": part_number},
        ExpiresIn=expiry,
    )


def completar_multipart_r2(key: str, upload_id: str, parts: list[dict]) -> None:
    _r2_client().complete_multipart_upload(
        Bucket=settings.R2_BUCKET, Key=key, UploadId=upload_id,
        MultipartUpload={"Parts": parts},
    )


def abortar_multipart_r2(key: str, upload_id: str) -> None:
    try:
        _r2_client().abort_multipart_upload(Bucket=settings.R2_BUCKET, Key=key, UploadId=upload_id)
    except Exception:
        pass


def leer_cabecera(key: str, length: int = 132) -> bytes:
    if _is_r2():
        resp = _r2_client().get_object(
            Bucket=settings.R2_BUCKET, Key=key, Range=f"bytes=0-{length - 1}"
        )
        return resp["Body"].read()
    return (STORAGE_ROOT / key).read_bytes()[:length]


def eliminar_objeto(key: str) -> None:
    if _is_r2():
        _r2_client().delete_object(Bucket=settings.R2_BUCKET, Key=key)
    else:
        path = STORAGE_ROOT / key
        if path.exists():
            path.unlink()


def get_url(key: str, expiry: int | None = None) -> str:
    """Retorna URL servible para una key. Firmada si R2, estática si local."""
    if _is_r2():
        exp = expiry or settings.R2_URL_EXPIRY_SECONDS
        return _r2_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.R2_BUCKET, "Key": key},
            ExpiresIn=exp,
        )
    return f"/static/{key}"


def get_bytes(key: str) -> bytes:
    """Descarga el contenido de una key (para ZIPs, etc.)."""
    if _is_r2():
        resp = _r2_client().get_object(Bucket=settings.R2_BUCKET, Key=key)
        return resp["Body"].read()
    return (STORAGE_ROOT / key).read_bytes()


def stream_bytes(key: str, chunk_size: int = 1024 * 1024):
    """Genera chunks del archivo sin cargarlo en RAM — para ZIPs en streaming."""
    if _is_r2():
        resp = _r2_client().get_object(Bucket=settings.R2_BUCKET, Key=key)
        yield from resp["Body"].iter_chunks(chunk_size)
    else:
        path = STORAGE_ROOT / key
        with open(path, "rb") as f:
            while chunk := f.read(chunk_size):
                yield chunk
