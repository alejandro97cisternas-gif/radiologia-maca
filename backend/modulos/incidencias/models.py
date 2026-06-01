from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from core.database import Base


class Incidencia(Base):
    __tablename__ = "incidencias"

    id = Column(Integer, primary_key=True, index=True)
    examen_id = Column(Integer, ForeignKey("examenes.id", ondelete="CASCADE"), unique=True, nullable=False)
    comentario_doctora = Column(Text, nullable=False)
    comentario_derivador = Column(Text, nullable=True)
    estado = Column(String, default="ABIERTA")   # ABIERTA | RESUELTA
    creado_en = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    resuelto_en = Column(DateTime, nullable=True)

    examen = relationship("Examen", backref="incidencia", uselist=False)
