from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from core.database import Base


class Informe(Base):
    __tablename__ = "informes"

    id = Column(Integer, primary_key=True, index=True)
    examen_id = Column(Integer, ForeignKey("examenes.id"), nullable=False)
    ruta_pdf = Column(String, nullable=False)
    token_publico = Column(String, unique=True, nullable=False)
    subido_en = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    notificacion_enviada = Column(Boolean, default=False)

    examen = relationship("Examen", back_populates="informes")
