from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from core.database import Base


class Derivador(Base):
    __tablename__ = "derivadores"

    id = Column(Integer, primary_key=True, index=True)
    radiologo_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    nombre = Column(String, nullable=False)
    email = Column(String, nullable=False)
    telefono = Column(String, nullable=True)
    activo = Column(Boolean, default=True)
    color = Column(String, nullable=True, default="#6b7280", server_default="#6b7280")
    moneda = Column(String(3), nullable=False, default="CLP", server_default="CLP")
    creado_en = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    radiologo = relationship("Usuario", back_populates="derivadores")
    magic_links = relationship("PortalMagicLink", back_populates="derivador", cascade="all, delete-orphan")
    pacientes = relationship("Paciente", back_populates="derivador")
    tarifas = relationship("TarifaDerivador", back_populates="derivador", cascade="all, delete-orphan")
    honorarios = relationship("Honorario", back_populates="derivador")


class PortalMagicLink(Base):
    __tablename__ = "portal_magic_links"

    id = Column(Integer, primary_key=True, index=True)
    derivador_id = Column(Integer, ForeignKey("derivadores.id"), nullable=False)
    token = Column(String, unique=True, nullable=False)
    expira_en = Column(DateTime, nullable=False)
    activo = Column(Boolean, default=True)
    creado_en = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    derivador = relationship("Derivador", back_populates="magic_links")
