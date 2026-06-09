"""
Normaliza todos los RUTs existentes en la tabla pacientes al formato XX.XXX.XXX-Y.

Ejecutar en VPS:
    docker exec -it maca_backend python scripts/normalizar_ruts.py
    docker exec -it maca_backend python scripts/normalizar_ruts.py --apply
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DRY_RUN = "--apply" not in sys.argv

from core.database import SessionLocal
from core.rut_utils import normalizar_rut, limpiar_rut
from modulos.pacientes.models import Paciente

db = SessionLocal()
actualizados = 0
sin_cambio = 0

for p in db.query(Paciente).filter(Paciente.rut.isnot(None)).all():
    nuevo = normalizar_rut(p.rut)
    if nuevo == p.rut:
        sin_cambio += 1
        continue
    print(f"  {p.rut!r:30} → {nuevo!r}")
    if not DRY_RUN:
        p.rut = nuevo
    actualizados += 1

if not DRY_RUN:
    db.commit()

db.close()
print(f"\nActualizados: {actualizados}  Sin cambio: {sin_cambio}")
if DRY_RUN:
    print("[DRY-RUN] Pasa --apply para aplicar.")
