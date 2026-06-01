from sqlalchemy import Column, Integer, String, Numeric, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from core.database import Base


class TarifaDerivador(Base):
    __tablename__ = "tarifas_derivador"
    __table_args__ = (UniqueConstraint("derivador_id", "tipo_examen"),)

    id = Column(Integer, primary_key=True, index=True)
    derivador_id = Column(Integer, ForeignKey("derivadores.id"), nullable=False)
    tipo_examen = Column(String, nullable=False)
    precio = Column(Numeric(10, 0), nullable=False, default=0)
    activa = Column(Boolean, default=True)

    derivador = relationship("Derivador", back_populates="tarifas")
