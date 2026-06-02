from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Numeric
from datetime import datetime, timezone
from core.database import Base


class Convenio(Base):
    __tablename__ = "convenios"

    id = Column(Integer, primary_key=True, index=True)
    radiologo_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    derivador_id = Column(Integer, ForeignKey("derivadores.id"), nullable=True)  # NULL = todos los derivadores
    categoria = Column(String, nullable=False)
    descuento_2 = Column(Numeric(10, 0), nullable=False, default=0)
    descuento_3 = Column(Numeric(10, 0), nullable=False, default=0)
    activo = Column(Boolean, default=True)
    creado_en = Column(DateTime, default=lambda: datetime.now(timezone.utc))
