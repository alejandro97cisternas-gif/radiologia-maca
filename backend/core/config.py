from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str = "dev-secret-key"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    APP_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:5173"
    BASE_DOMAIN: str = "localhost"  # tudominio.com en producción

    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "Dra. Habash <notificaciones@novex.cloud>"

    # SMTP (Gmail u otro proveedor como alternativa a Resend)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    STORAGE_ROOT: str = "data"

    # Storage backend: "local" | "r2"
    STORAGE_BACKEND: str = "local"
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY: str = ""
    R2_SECRET_KEY: str = ""
    R2_BUCKET: str = ""
    R2_URL_EXPIRY_SECONDS: int = 86400  # URLs firmadas expiran en 24h

    # Superadmin seed
    SUPERADMIN_USERNAME: str = "admin"
    SUPERADMIN_PASSWORD: str = "change-me-in-production"
    SUPERADMIN_EMAIL: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()

APP_URL = settings.APP_URL
