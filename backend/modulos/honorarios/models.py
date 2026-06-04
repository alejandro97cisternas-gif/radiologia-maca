from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from core.database import Base


class Honorario(Base):
    __tablename__ = "honorarios"
    __table_args__ = (UniqueConstraint("derivador_id", "periodo"),)

    id = Column(Integer, primary_key=True, index=True)
    derivador_id = Column(Integer, ForeignKey("derivadores.id"), nullable=False)
    periodo = Column(String(7), nullable=False)  # YYYY-MM
    total = Column(Numeric(12, 0), nullable=False, default=0)
    detalle_json = Column(String, nullable=True)  # JSON list of line items
    moneda = Column(String(3), nullable=False, default="CLP", server_default="CLP")
    estado = Column(String, default="BORRADOR")   # BORRADOR | ENVIADO
    enviado_en = Column(DateTime, nullable=True)
    creado_en = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    derivador = relationship("Derivador", back_populates="honorarios")
