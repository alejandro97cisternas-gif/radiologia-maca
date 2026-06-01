from sqlalchemy import Column, Integer, Boolean, DateTime, Text, ForeignKey
from datetime import datetime, timezone
from core.database import Base


class Notificacion(Base):
    __tablename__ = "notificaciones"

    id = Column(Integer, primary_key=True, index=True)
    radiologo_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    mensaje = Column(Text, nullable=False)
    leida = Column(Boolean, default=False)
    creado_en = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    # NULL → notificación para el radiólogo; SET → notificación para portal del derivador
    derivador_id = Column(Integer, ForeignKey("derivadores.id"), nullable=True)
    examen_id = Column(Integer, ForeignKey("examenes.id"), nullable=True)
