from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from core.database import Base

ESTADOS = ["BORRADOR", "PENDIENTE", "EN_PROCESO", "COMPLETADO"]


class Examen(Base):
    __tablename__ = "examenes"

    id = Column(Integer, primary_key=True, index=True)
    paciente_id = Column(Integer, ForeignKey("pacientes.id"), nullable=False)
    derivador_id = Column(Integer, ForeignKey("derivadores.id"), nullable=False)
    tipo_examen = Column(String, nullable=False)
    caso_id = Column(String, nullable=True, index=True)
    estado = Column(String, default="BORRADOR")
    version = Column(Integer, default=0, server_default="0")
    notificacion_doctora_enviada = Column(Boolean, default=False)
    notificacion_derivador_enviada = Column(Boolean, default=False)
    creado_en = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completado_en = Column(DateTime, nullable=True)

    paciente = relationship("Paciente", back_populates="examenes")
    derivador = relationship("Derivador")
    imagenes = relationship("ImagenExamen", back_populates="examen", cascade="all, delete-orphan")
    informes = relationship("Informe", back_populates="examen", cascade="all, delete-orphan", order_by="Informe.id")

    @property
    def informe(self):
        return self.informes[-1] if self.informes else None
    revisiones = relationship("RevisionExamen", back_populates="examen", cascade="all, delete-orphan", order_by="RevisionExamen.id")


class ImagenExamen(Base):
    __tablename__ = "imagenes_examen"

    id = Column(Integer, primary_key=True, index=True)
    examen_id = Column(Integer, ForeignKey("examenes.id"), nullable=False)
    tipo = Column(String, nullable=False)  # 2D | DICOM | PREVIEW
    nombre_archivo = Column(String, nullable=False)
    ruta = Column(String, nullable=False)
    subido_en = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    examen = relationship("Examen", back_populates="imagenes")


class RevisionExamen(Base):
    __tablename__ = "revisiones_examen"

    id = Column(Integer, primary_key=True, index=True)
    examen_id = Column(Integer, ForeignKey("examenes.id", ondelete="CASCADE"), nullable=False)
    numero_version = Column(Integer, nullable=False)
    tipo_cambio = Column(String, nullable=False)
    nombre_archivo = Column(String, nullable=True)
    comentario = Column(Text, nullable=True)
    creado_en = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    examen = relationship("Examen", back_populates="revisiones")


class TipoExamenCustom(Base):
    __tablename__ = "tipos_examen_custom"
    __table_args__ = (UniqueConstraint("radiologo_id", "nombre"),)

    id = Column(Integer, primary_key=True, index=True)
    radiologo_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    nombre = Column(String, nullable=False)
    dimension = Column(String, nullable=False, default="2D")  # 2D | 3D | AMBOS
    categoria = Column(String, nullable=True)
    activo = Column(Boolean, default=True)
    creado_en = Column(DateTime, default=lambda: datetime.now(timezone.utc))
