"""
Tipos de examen por defecto para cada radiólogo.
Se llama al crear un nuevo radiólogo desde el panel admin.
"""

TIPOS_CEFALOMETRIA = [
    "Análisis de Jarabak",
    "Análisis Jarabak-Bondi",
    "Análisis de Bjork",
    "Análisis de Burstone-Legan",
    "Análisis de Burstone-Legan (perfil)",
    "Análisis de Cagliari",
    "Análisis de Cervera",
    "Análisis de Garcia Coffin",
    "Análisis de Delaire",
    "Análisis de Bejarano-DIOC",
    "Análisis de Downs",
    "Análisis Facial",
    "Análisis de Gianelly",
    "Análisis de Giannì",
    "Análisis Fundación Gnathos",
    "Hasund-Segner",
    "Análisis de Maino",
    "Análisis de McGann",
    "Análisis de Mc. Namara",
    "Análisis de Solano MSE",
    "Análisis de MSTO",
    "Análisis de Olmos",
    "Análisis de Powell",
    "Análisis de Perfil Dento-Esqueletal",
    "Análisis de Ricketts",
    "Análisis de Ricketts Resumido",
    "Análisis de Rinaldi",
    "Análisis de Roth - Jarabak",
    "Schwartz",
    "STCA",
    "Análisis de Steiner",
    "Análisis de Perfil Blando",
    "Análisis de Tweed - Merrifield",
    "Índice de Vert",
    "Medidas en VTO",
]


def seed_tipos_examen(radiologo_id: int, db) -> None:
    """Crea los tipos de examen por defecto para un radiólogo recién creado."""
    from modulos.examenes.models import TipoExamenCustom

    existentes = {
        t.nombre for t in db.query(TipoExamenCustom)
        .filter(TipoExamenCustom.radiologo_id == radiologo_id).all()
    }

    nuevos = [
        TipoExamenCustom(
            radiologo_id=radiologo_id,
            nombre=nombre,
            dimension="AMBOS",
            categoria="Análisis de Cefalometría",
            activo=True,
        )
        for nombre in TIPOS_CEFALOMETRIA
        if nombre not in existentes
    ]

    if nuevos:
        db.add_all(nuevos)
        db.commit()
