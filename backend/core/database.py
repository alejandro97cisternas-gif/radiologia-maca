from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from core.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def seed_superadmin():
    import bcrypt
    from modulos.usuarios.models import Usuario

    db = SessionLocal()
    try:
        if db.query(Usuario).filter(Usuario.rol == "superadmin").count() > 0:
            return
        password = settings.SUPERADMIN_PASSWORD
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        db.add(Usuario(
            username=settings.SUPERADMIN_USERNAME,
            password_hash=hashed,
            rol="superadmin",
            slug=None,
            nombre_display="Superadmin",
            email=settings.SUPERADMIN_EMAIL,
            activo=True,
        ))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
