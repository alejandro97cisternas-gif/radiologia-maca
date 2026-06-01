from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from core.database import Base


class Paciente(Base):
    __tablename__ = "pacientes"

    id = Column(Integer, primary_key=True, index=True)
    radiologo_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    derivador_id = Column(Integer, ForeignKey("derivadores.id"), nullable=False)
    nombre_completo = Column(String, nullable=False)
    rut = Column(String, nullable=True)
    fecha_nacimiento = Column(Date, nullable=True)
    creado_en = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    derivador = relationship("Derivador", back_populates="pacientes")
    examenes = relationship("Examen", back_populates="paciente")
