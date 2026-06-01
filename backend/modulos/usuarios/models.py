from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from core.database import Base

ROLES = ["superadmin", "radiologo"]


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    rol = Column(String, nullable=False, default="radiologo")  # superadmin | radiologo
    slug = Column(String, unique=True, nullable=True)          # subdominio: draperez
    nombre_display = Column(String, nullable=True)             # "Dra. Pérez"
    email = Column(String, nullable=True)
    activo = Column(Boolean, default=True)
    creado_en = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    derivadores = relationship("Derivador", back_populates="radiologo")
