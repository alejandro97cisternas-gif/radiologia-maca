import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import or_
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
from modulos.convenios.models import Convenio

_TIPOS_BASE: set[str] = set()  # sin tipos hardcodeados — todos son custom por radiologo

router = APIRouter(prefix="/api/honorarios", tags=["honorarios"])


def _calcular_detalle(derivador_id: int, periodo: str, db: Session, radiologo_id: int) -> tuple[int, list]:
    anio, mes = periodo.split("-")
    inicio = datetime(int(anio), int(mes), 1, tzinfo=timezone.utc)
    fin = datetime(int(anio) + 1, 1, 1, tzinfo=timezone.utc) if int(mes) == 12 else datetime(int(anio), int(mes) + 1, 1, tzinfo=timezone.utc)

    examenes = (db.query(Examen)
                .filter(Examen.derivador_id == derivador_id,
                        Examen.estado != "BORRADOR",
                        Examen.creado_en >= inicio, Examen.creado_en < fin).all())
    tarifas = {t.tipo_examen.upper(): int(t.precio) for t in db.query(TarifaDerivador).filter(TarifaDerivador.derivador_id == derivador_id).all()}

    convenios = {
        c.categoria: c
        for c in db.query(Convenio).filter(
            Convenio.radiologo_id == radiologo_id,
            or_(Convenio.derivador_id == derivador_id, Convenio.derivador_id == None),
            Convenio.activo == True,
        ).all()
    }
    _raw_tipos = db.query(TipoExamenCustom).filter(TipoExamenCustom.radiologo_id == radiologo_id).all()
    cat_map: dict[str, str | None] = {}
    for t in _raw_tipos:
        key = t.nombre.upper()
        # prefer the entry that has a categoria (seed record) over duplicates without it
        if key not in cat_map or (t.categoria is not None and cat_map[key] is None):
            cat_map[key] = t.categoria

    casos: dict[str, list] = {}
    for e in examenes:
        key = e.caso_id or f"__solo_{e.id}__"
        casos.setdefault(key, []).append(e)

    detalle, total = [], 0
    for caso_examenes in casos.values():
        cat_count: dict[str, int] = {}
        for e in sorted(caso_examenes, key=lambda x: x.id):
            precio_base = tarifas.get(e.tipo_examen.upper(), 0)
            cat = cat_map.get(e.tipo_examen.upper())
            descuento = 0
            if cat and cat in convenios:
                conv = convenios[cat]
                cat_count[cat] = cat_count.get(cat, 0) + 1
                pos = cat_count[cat]
                if pos == 2:
                    descuento = int(conv.descuento_2)
                elif pos >= 3:
                    descuento = int(conv.descuento_3)
            precio = max(0, precio_base - descuento)
            total += precio
            detalle.append({
                "examen_id": e.id, "paciente": e.paciente.nombre_completo,
                "tipo_examen": e.tipo_examen, "fecha": e.creado_en.strftime("%Y-%m-%d"),
                "precio": precio, "precio_base": precio_base, "descuento": descuento,
                "caso_id": e.caso_id,
            })

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
            "moneda": d.moneda,
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
    total, detalle = _calcular_detalle(derivador_id, periodo, db, radiologo.id)
    honorario = db.query(Honorario).filter(Honorario.derivador_id == derivador_id, Honorario.periodo == periodo).first()
    return {"derivador": derivador.nombre, "moneda": derivador.moneda, "periodo": periodo, "total": total, "estado": honorario.estado if honorario else "SIN_GENERAR", "detalle": detalle}


@router.post("/{derivador_id}/generar")
def generar(derivador_id: int, request: Request, periodo: str = Query(...), db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    derivador = _derivador_del_tenant(derivador_id, radiologo.id, db)
    total, detalle = _calcular_detalle(derivador_id, periodo, db, radiologo.id)
    honorario = db.query(Honorario).filter(Honorario.derivador_id == derivador_id, Honorario.periodo == periodo).first()
    if honorario:
        honorario.total = total
        honorario.moneda = derivador.moneda
        honorario.detalle_json = json.dumps(detalle, ensure_ascii=False)
        honorario.estado = "BORRADOR"
    else:
        honorario = Honorario(derivador_id=derivador_id, periodo=periodo, total=total, moneda=derivador.moneda, detalle_json=json.dumps(detalle, ensure_ascii=False), estado="BORRADOR")
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
    ok, msg = enviar_honorarios(derivador, periodo, pdf_bytes, radiologo_nombre=radiologo.nombre_display or "")
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
        from sqlalchemy import func as sqlfunc
        custom = db.query(TipoExamenCustom).filter(
            TipoExamenCustom.radiologo_id == radiologo.id,
            sqlfunc.upper(TipoExamenCustom.nombre) == nombre,
        ).first()
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


# ── Convenios ────────────────────────────────────────────────────────────────

class ConvenioCreate(BaseModel):
    categoria: str
    descuento_2: int = 0
    descuento_3: int = 0


@router.get("/{derivador_id}/convenios")
def listar_convenios(derivador_id: int, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    _derivador_del_tenant(derivador_id, radiologo.id, db)
    convs = db.query(Convenio).filter(
        Convenio.radiologo_id == radiologo.id,
        or_(Convenio.derivador_id == derivador_id, Convenio.derivador_id == None),
        Convenio.activo == True,
    ).all()
    return [{"id": c.id, "categoria": c.categoria, "descuento_2": int(c.descuento_2), "descuento_3": int(c.descuento_3)} for c in convs]


@router.post("/{derivador_id}/convenios", status_code=201)
def crear_convenio(derivador_id: int, body: ConvenioCreate, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    _derivador_del_tenant(derivador_id, radiologo.id, db)
    existing = db.query(Convenio).filter(
        Convenio.radiologo_id == radiologo.id,
        Convenio.derivador_id == derivador_id,
        Convenio.categoria == body.categoria,
        Convenio.activo == True,
    ).first()
    if existing:
        existing.descuento_2 = body.descuento_2
        existing.descuento_3 = body.descuento_3
        db.commit()
        return {"id": existing.id, "categoria": existing.categoria, "descuento_2": int(existing.descuento_2), "descuento_3": int(existing.descuento_3)}
    conv = Convenio(radiologo_id=radiologo.id, derivador_id=derivador_id, categoria=body.categoria, descuento_2=body.descuento_2, descuento_3=body.descuento_3)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return {"id": conv.id, "categoria": conv.categoria, "descuento_2": int(conv.descuento_2), "descuento_3": int(conv.descuento_3)}


@router.delete("/{derivador_id}/convenios/{convenio_id}", status_code=204)
def eliminar_convenio(derivador_id: int, convenio_id: int, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    _derivador_del_tenant(derivador_id, radiologo.id, db)
    conv = db.query(Convenio).filter(Convenio.id == convenio_id, Convenio.radiologo_id == radiologo.id).first()
    if not conv:
        raise HTTPException(404, "Convenio no encontrado")
    conv.activo = False
    db.commit()


# ── Preview PDF ───────────────────────────────────────────────────────────────

@router.get("/{derivador_id}/preview")
def preview_pdf(derivador_id: int, request: Request, periodo: str = Query(...), db: Session = Depends(get_db), _=Depends(get_current_user)):
    radiologo = get_tenant(request)
    derivador = _derivador_del_tenant(derivador_id, radiologo.id, db)
    total, detalle = _calcular_detalle(derivador_id, periodo, db, radiologo.id)
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
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    import io

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=40, bottomMargin=40, leftMargin=50, rightMargin=50)
    styles = getSampleStyleSheet()

    cell_style = ParagraphStyle("cell", fontName="Helvetica", fontSize=8, leading=10, wordWrap="CJK")
    bold_style = ParagraphStyle("bold_cell", fontName="Helvetica-Bold", fontSize=8, leading=10)

    moneda = getattr(derivador, "moneda", "CLP")
    simbolo = "CA$" if moneda == "CAD" else "$"

    elements = [
        Paragraph(f"Honorarios — {derivador.nombre}", styles["Heading1"]),
        Paragraph(f"Período: {periodo}  |  Moneda: {moneda}", styles["Normal"]),
        Spacer(1, 20),
    ]

    detalle = json.loads(honorario.detalle_json or "[]")
    # A4 usable width = 495pt (595 - 50L - 50R)
    data = [[
        Paragraph("<b>Fecha</b>", bold_style),
        Paragraph("<b>Paciente</b>", bold_style),
        Paragraph("<b>Examen</b>", bold_style),
        Paragraph("<b>Precio</b>", bold_style),
    ]]
    for item in detalle:
        data.append([
            Paragraph(item["fecha"], cell_style),
            Paragraph(item["paciente"], cell_style),
            Paragraph(item["tipo_examen"], cell_style),
            Paragraph(f"{simbolo}{item['precio']:,}", cell_style),
        ])
    data.append([
        Paragraph("", cell_style), Paragraph("", cell_style),
        Paragraph("<b>TOTAL</b>", bold_style),
        Paragraph(f"<b>{simbolo}{int(honorario.total):,}</b>", bold_style),
    ])

    tabla = Table(data, colWidths=[65, 155, 195, 80])
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563EB")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#EFF6FF")),
        ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(tabla)
    doc.build(elements)
    buffer.seek(0)
    return buffer.read()
