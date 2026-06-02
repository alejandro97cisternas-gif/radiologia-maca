"""
Agrega los tipos CBCT y Estudio Ortodoncia a todos los radiólogos existentes.
Ejecutar desde backend/:
    python scripts/reseed_tipos_examen.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import modulos.usuarios.models
import modulos.derivadores.models
import modulos.pacientes.models
import modulos.examenes.models
import modulos.informes.models
import modulos.tarifas.models
import modulos.honorarios.models
import modulos.incidencias.models
import modulos.notificaciones.models

from core.database import SessionLocal
from modulos.usuarios.models import Usuario
from core.seed_examenes import seed_tipos_examen

db = SessionLocal()
try:
    radiologos = db.query(Usuario).filter(Usuario.rol == "radiologo", Usuario.activo == True).all()
    for r in radiologos:
        seed_tipos_examen(r.id, db)
        print(f"  ✓ {r.nombre_display} ({r.slug})")
    print(f"\nListo. {len(radiologos)} radiólogo(s) actualizados.")
finally:
    db.close()
