import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
from core.database import get_db
from core.dependencies import get_current_user
from core.tenant import get_tenant
from core.email_service import enviar_honorarios
from modulos.derivadores.models import Derivador
from modulos.examenes.models import Examen, TipoExamenCustom
from modulos.tarifas.models import TarifaDerivador
from modulos.honorarios.models import Honorario

_TIPOS_BASE: set[str] = set()  # sin tipos hardcodeados — todos son custom por radiologo

router = APIRouter(prefix="/api/honorarios", tags=["honorarios"])


def _calcular_detalle(derivador_id: int, periodo: str, db: Session) -> tuple[int, list]:
    anio, mes = periodo.split("-")
    inicio = datetime(int(anio), int(mes), 1, tzinfo=timezone.utc)
    fin = datetime(int(anio) + 1, 1, 1, tzinfo=timezone.utc) if int(mes) == 12 else datetime(int(anio), int(mes) + 1, 1, tzinfo=timezone.utc)

    examenes = (db.query(Examen)
                .filter(Examen.derivador_id == derivador_id, Examen.estado == "COMPLETADO",
                        Examen.completado_en >= inicio, Examen.completado_en < fin).all())
    tarifas = {t.tipo_examen: int(t.precio) for t in db.query(TarifaDerivador).filter(TarifaDerivador.derivador_id == derivador_id).all()}

    detalle, total = [], 0
    for e in examenes:
        precio = tarifas.get(e.tipo_examen, 0)
        total += precio
        detalle.append({"examen_id": e.id, "paciente": e.paciente.nombre_completo, "tipo_examen": e.tipo_examen, "fecha": e.completado_en.strftime("%Y-%m-%d"), "precio": precio})

    return total, detalle


def _derivador_del_tenant(derivador_id: int, radiologo_id: int, db: Session) -> Derivador:
    d = db.query(Derivador).filter(Derivador.id == derivador_id, Derivador.radiologo_id == radiologo_id).first()
    if not d:
        raise HTTPException(404, "Derivador no encontrado")
    return d


@router.get("")
def resumen_global(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    derivadores = db.query(Derivador).filter(Derivador.radiologo_id == radiologo.id, Derivador.activo == True).all()
    return [
        {
            "derivador_id": d.id,
            "derivador_nombre": d.nombre,
            "honorarios": [
                {"periodo": h.periodo, "total": int(h.total), "estado": h.estado, "enviado_en": h.enviado_en}
                for h in db.query(Honorario).filter(Honorario.derivador_id == d.id).order_by(Honorario.periodo.desc()).all()
            ],
        }
        for d in derivadores
    ]


@router.get("/{derivador_id}")
def detalle_derivador(derivador_id: int, request: Request, periodo: str = Query(...), db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    derivador = _derivador_del_tenant(derivador_id, radiologo.id, db)
    total, detalle = _calcular_detalle(derivador_id, periodo, db)
    honorario = db.query(Honorario).filter(Honorario.derivador_id == derivador_id, Honorario.periodo == periodo).first()
    return {"derivador": derivador.nombre, "periodo": periodo, "total": total, "estado": honorario.estado if honorario else "SIN_GENERAR", "detalle": detalle}


@router.post("/{derivador_id}/generar")
def generar(derivador_id: int, request: Request, periodo: str = Query(...), db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    _derivador_del_tenant(derivador_id, radiologo.id, db)
    total, detalle = _calcular_detalle(derivador_id, periodo, db)
    honorario = db.query(Honorario).filter(Honorario.derivador_id == derivador_id, Honorario.periodo == periodo).first()
    if honorario:
        honorario.total = total
        honorario.detalle_json = json.dumps(detalle, ensure_ascii=False)
        honorario.estado = "BORRADOR"
    else:
        honorario = Honorario(derivador_id=derivador_id, periodo=periodo, total=total, detalle_json=json.dumps(detalle, ensure_ascii=False), estado="BORRADOR")
        db.add(honorario)
    db.commit()
    db.refresh(honorario)
    return {"id": honorario.id, "total": total, "examenes": len(detalle), "estado": honorario.estado}


@router.post("/{derivador_id}/enviar")
def enviar(derivador_id: int, request: Request, periodo: str = Query(...), db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    derivador = _derivador_del_tenant(derivador_id, radiologo.id, db)
    honorario = db.query(Honorario).filter(Honorario.derivador_id == derivador_id, Honorario.periodo == periodo).first()
    if not honorario:
        raise HTTPException(400, "Primero genere los honorarios del período")
    pdf_bytes = _generar_pdf(derivador, honorario, periodo)
    ok, msg = enviar_honorarios(derivador, periodo, pdf_bytes)
    if ok:
        honorario.estado = "ENVIADO"
        honorario.enviado_en = datetime.now(timezone.utc)
        db.commit()
    return {"enviado": ok, "mensaje": msg}


# ── Tipos de examen ───────────────────────────────────────────────────────────

class TipoExamenCreate(BaseModel):
    nombre: str
    dimension: str
    categoria: str | None = None


@router.post("/tipos-examen", status_code=201)
def crear_tipo_examen(body: TipoExamenCreate, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    nombre = body.nombre.strip().upper()
    if body.dimension not in ("2D", "3D", "AMBOS"):
        raise HTTPException(400, "dimension debe ser '2D', '3D' o 'AMBOS'")
    if nombre in _TIPOS_BASE:
        raise HTTPException(409, "Este tipo ya existe en el sistema base")
    existing = db.query(TipoExamenCustom).filter(TipoExamenCustom.radiologo_id == radiologo.id, TipoExamenCustom.nombre == nombre).first()
    if existing:
        if not existing.activo:
            existing.activo = True
            existing.dimension = body.dimension
            db.commit()
            return {"id": existing.id, "nombre": existing.nombre, "dimension": existing.dimension, "custom": True}
        raise HTTPException(409, "Este tipo ya existe")
    nuevo = TipoExamenCustom(radiologo_id=radiologo.id, nombre=nombre, dimension=body.dimension, categoria=body.categoria)
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return {"id": nuevo.id, "nombre": nuevo.nombre, "dimension": nuevo.dimension, "categoria": nuevo.categoria, "custom": True}


@router.get("/tipos-examen")
def listar_todos_tipos(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    tipos = db.query(TipoExamenCustom).filter(TipoExamenCustom.radiologo_id == radiologo.id).order_by(TipoExamenCustom.categoria, TipoExamenCustom.nombre).all()
    return [{"id": t.id, "nombre": t.nombre, "dimension": t.dimension, "categoria": t.categoria, "activo": t.activo} for t in tipos]


@router.patch("/tipos-examen/{tipo_id}")
def toggle_tipo_examen(tipo_id: int, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    tipo = db.query(TipoExamenCustom).filter(TipoExamenCustom.id == tipo_id, TipoExamenCustom.radiologo_id == radiologo.id).first()
    if not tipo:
        raise HTTPException(404, "Tipo no encontrado")
    tipo.activo = not tipo.activo
    db.commit()
    return {"id": tipo.id, "nombre": tipo.nombre, "activo": tipo.activo}


# ── Tarifas ───────────────────────────────────────────────────────────────────

class TarifaItemCreate(BaseModel):
    tipo_examen: str
    precio: int
    dimension: str = "2D"


@router.get("/{derivador_id}/tarifas")
def listar_tarifas(derivador_id: int, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    _derivador_del_tenant(derivador_id, radiologo.id, db)
    tarifas = db.query(TarifaDerivador).filter(TarifaDerivador.derivador_id == derivador_id).all()
    return [{"tipo_examen": t.tipo_examen, "precio": int(t.precio)} for t in tarifas]


@router.post("/{derivador_id}/tarifas/item", status_code=201)
def crear_tarifa_item(derivador_id: int, body: TarifaItemCreate, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    _derivador_del_tenant(derivador_id, radiologo.id, db)
    nombre = body.tipo_examen.strip().upper()
    if nombre not in _TIPOS_BASE:
        custom = db.query(TipoExamenCustom).filter(TipoExamenCustom.radiologo_id == radiologo.id, TipoExamenCustom.nombre == nombre).first()
        if custom:
            if not custom.activo:
                custom.activo = True
        else:
            db.add(TipoExamenCustom(radiologo_id=radiologo.id, nombre=nombre, dimension=body.dimension))
    tarifa = db.query(TarifaDerivador).filter(TarifaDerivador.derivador_id == derivador_id, TarifaDerivador.tipo_examen == nombre).first()
    if tarifa:
        tarifa.precio = body.precio
    else:
        tarifa = TarifaDerivador(derivador_id=derivador_id, tipo_examen=nombre, precio=body.precio)
        db.add(tarifa)
    db.commit()
    return {"tipo_examen": nombre, "precio": body.precio}


@router.delete("/{derivador_id}/tarifas/{tipo_examen}", status_code=204)
def eliminar_tarifa_item(derivador_id: int, tipo_examen: str, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    _derivador_del_tenant(derivador_id, radiologo.id, db)
    tarifa = db.query(TarifaDerivador).filter(TarifaDerivador.derivador_id == derivador_id, TarifaDerivador.tipo_examen == tipo_examen).first()
    if not tarifa:
        raise HTTPException(404, "Tarifa no encontrada")
    db.delete(tarifa)
    db.commit()


# ── Preview PDF ───────────────────────────────────────────────────────────────

@router.get("/{derivador_id}/preview")
def preview_pdf(derivador_id: int, request: Request, periodo: str = Query(...), db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    derivador = _derivador_del_tenant(derivador_id, radiologo.id, db)
    total, detalle = _calcular_detalle(derivador_id, periodo, db)
    honorario = db.query(Honorario).filter(Honorario.derivador_id == derivador_id, Honorario.periodo == periodo).first()

    class _Doc:
        pass
    doc = honorario or _Doc()
    doc.total = total
    doc.detalle_json = json.dumps(detalle, ensure_ascii=False)

    pdf_bytes = _generar_pdf(derivador, doc, periodo)
    nombre = f"honorarios_{derivador.nombre.replace(' ', '_')}_{periodo}.pdf"
    return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename={nombre}"})


def _generar_pdf(derivador, honorario, periodo: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    import io

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=40, bottomMargin=40, leftMargin=50, rightMargin=50)
    styles = getSampleStyleSheet()
    elements = [
        Paragraph(f"Honorarios — {derivador.nombre}", styles["Heading1"]),
        Paragraph(f"Período: {periodo}", styles["Normal"]),
        Spacer(1, 20),
    ]

    detalle = json.loads(honorario.detalle_json or "[]")
    data = [["Fecha", "Paciente", "Examen", "Precio"]]
    for item in detalle:
        data.append([item["fecha"], item["paciente"], item["tipo_examen"], f"${item['precio']:,}"])
    data.append(["", "", "TOTAL", f"${int(honorario.total):,}"])

    tabla = Table(data, colWidths=[80, 200, 100, 80])
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563EB")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#EFF6FF")),
        ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
    ]))
    elements.append(tabla)
    doc.build(elements)
    buffer.seek(0)
    return buffer.read()
