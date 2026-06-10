from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from collections import defaultdict
from core.database import get_db
from core.dependencies import get_current_user
from core.tenant import get_tenant
from modulos.examenes.models import Examen
from modulos.derivadores.models import Derivador
from modulos.pacientes.models import Paciente

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/calendario")
def calendario(
    request: Request,
    mes: str = Query(..., description="YYYY-MM"),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    try:
        anio, mes_num = int(mes.split("-")[0]), int(mes.split("-")[1])  # noqa: F841
    except (ValueError, IndexError):
        raise HTTPException(400, "mes debe ser YYYY-MM")

    radiologo = get_tenant(request)
    examenes = (db.query(Examen)
                .join(Derivador, Examen.derivador_id == Derivador.id)
                .filter(
                    Derivador.radiologo_id == radiologo.id,
                    Examen.estado.in_(["PENDIENTE", "EN_PROCESO"]),
                ).all())

    por_dia: dict[str, list] = defaultdict(list)
    for e in examenes:
        dia = e.creado_en.strftime("%Y-%m-%d")
        if dia.startswith(mes):
            por_dia[dia].append({
                "id": e.id,
                "paciente": e.paciente.nombre_completo,
                "tipo_examen": e.tipo_examen,
                "derivador": e.derivador.nombre,
                "estado": e.estado,
            })

    return {"mes": mes, "dias": dict(por_dia)}


@router.get("/carpetas")
def carpetas(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    derivadores = (db.query(Derivador)
                   .filter(Derivador.radiologo_id == radiologo.id, Derivador.activo == True)
                   .order_by(Derivador.nombre).all())
    resultado = []
    for d in derivadores:
        pacientes = db.query(Paciente).filter(Paciente.derivador_id == d.id).order_by(Paciente.nombre_completo).all()
        resultado.append({
            "derivador_id": d.id,
            "derivador_nombre": d.nombre,
            "pacientes": [
                {
                    "paciente_id": p.id,
                    "paciente_nombre": p.nombre_completo,
                    "rut": p.rut,
                    "examenes": [
                        {"examen_id": e.id, "tipo_examen": e.tipo_examen, "estado": e.estado,
                         "creado_en": e.creado_en, "imagenes_count": len(e.imagenes), "tiene_informe": bool(e.informes)}
                        for e in p.examenes
                    ],
                }
                for p in pacientes
            ],
        })
    return resultado


@router.get("/carpetas/{derivador_id}")
def carpetas_derivador(derivador_id: int, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    derivador = db.query(Derivador).filter(Derivador.id == derivador_id, Derivador.radiologo_id == radiologo.id).first()
    if not derivador:
        raise HTTPException(404, "Derivador no encontrado")
    pacientes = db.query(Paciente).filter(Paciente.derivador_id == derivador_id).all()
    return {
        "derivador_id": derivador.id,
        "derivador_nombre": derivador.nombre,
        "pacientes": [
            {
                "paciente_id": p.id,
                "paciente_nombre": p.nombre_completo,
                "rut": p.rut,
                "examenes": [
                    {"examen_id": e.id, "tipo_examen": e.tipo_examen, "estado": e.estado,
                     "creado_en": e.creado_en, "imagenes_count": len(e.imagenes), "tiene_informe": bool(e.informes)}
                    for e in p.examenes
                ],
            }
            for p in pacientes
        ],
    }
