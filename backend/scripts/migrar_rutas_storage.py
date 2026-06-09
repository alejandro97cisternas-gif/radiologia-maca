"""
Migración única: inserta derivador_id en las rutas de storage existentes.

Antes: {radiologo_id}/{rut}/ordenes/{examen_id}/...
Ahora: {radiologo_id}/{derivador_id}/{rut}/ordenes/{examen_id}/...

Cómo ejecutar en la VPS:
    docker exec -it maca_backend python scripts/migrar_rutas_storage.py

El script es idempotente: detecta rutas ya migradas (segundo segmento numérico)
y las omite. Hace dry-run por defecto; pasa --apply para ejecutar cambios.
"""
import sys
import os

# Permite importar módulos del backend
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DRY_RUN = "--apply" not in sys.argv

from core.database import SessionLocal
from core.storage import _is_r2, _r2_client, STORAGE_ROOT
from core.config import settings
from modulos.examenes.models import ImagenExamen, Examen
from modulos.informes.models import Informe

db = SessionLocal()


def ya_migrada(ruta: str) -> bool:
    """El segundo segmento del path es derivador_id (numérico) si ya fue migrado."""
    partes = ruta.split("/")
    return len(partes) >= 2 and partes[1].isdigit()


def nueva_ruta(ruta: str, derivador_id: int) -> str:
    partes = ruta.split("/")
    # Inserta derivador_id después del primer segmento (radiologo_id)
    return "/".join([partes[0], str(derivador_id)] + partes[1:])


def copiar_r2(old_key: str, new_key: str) -> None:
    client = _r2_client()
    bucket = settings.R2_BUCKET
    client.copy_object(
        Bucket=bucket,
        CopySource={"Bucket": bucket, "Key": old_key},
        Key=new_key,
    )
    client.delete_object(Bucket=bucket, Key=old_key)


def mover_local(old_key: str, new_key: str) -> None:
    from pathlib import Path
    src = STORAGE_ROOT / old_key
    dst = STORAGE_ROOT / new_key
    if not src.exists():
        print(f"  AVISO: archivo local no encontrado: {src}")
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    src.rename(dst)


def migrar(old_key: str, new_key: str) -> None:
    if DRY_RUN:
        print(f"  [dry-run] {old_key}\n           → {new_key}")
        return
    if _is_r2():
        copiar_r2(old_key, new_key)
    else:
        mover_local(old_key, new_key)


# ── Cargar mapas ──────────────────────────────────────────────────────────────

examenes_map: dict[int, int] = {
    e.id: e.derivador_id
    for e in db.query(Examen.id, Examen.derivador_id).all()
}

imgs_migradas = 0
imgs_omitidas = 0
informes_migrados = 0
informes_omitidos = 0

# ── ImagenExamen ──────────────────────────────────────────────────────────────

print("\n=== ImagenExamen ===")
for img in db.query(ImagenExamen).all():
    if ya_migrada(img.ruta):
        imgs_omitidas += 1
        continue

    did = examenes_map.get(img.examen_id)
    if did is None:
        print(f"  ERROR: ImagenExamen #{img.id} → examen #{img.examen_id} sin derivador_id, omitido")
        imgs_omitidas += 1
        continue

    old = img.ruta
    new = nueva_ruta(old, did)
    migrar(old, new)

    if not DRY_RUN:
        img.ruta = new

    imgs_migradas += 1

# ── Informe ───────────────────────────────────────────────────────────────────

print("\n=== Informe (PDFs) ===")
for inf in db.query(Informe).all():
    if not inf.ruta_pdf or ya_migrada(inf.ruta_pdf):
        informes_omitidos += 1
        continue

    examen = db.query(Examen).filter_by(id=inf.examen_id).first()
    if not examen or not examen.derivador_id:
        print(f"  ERROR: Informe #{inf.id} → examen sin derivador_id, omitido")
        informes_omitidos += 1
        continue

    old = inf.ruta_pdf
    new = nueva_ruta(old, examen.derivador_id)
    migrar(old, new)

    if not DRY_RUN:
        inf.ruta_pdf = new

    informes_migrados += 1

# ── Guardar ───────────────────────────────────────────────────────────────────

if not DRY_RUN:
    db.commit()
    print("\n✓ Cambios guardados en DB.")

db.close()

print(f"""
Resumen:
  ImagenExamen  migradas={imgs_migradas}  omitidas(ya ok)={imgs_omitidas}
  Informe       migrados={informes_migrados}  omitidos(ya ok)={informes_omitidos}
{"[DRY-RUN] Ejecuta con --apply para aplicar los cambios." if DRY_RUN else "Migración completada."}
""")
