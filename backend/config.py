from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración cargada desde variables de entorno / `.env` (nunca versionado)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "production"] = "development"
    database_url: str = "sqlite:///./agropelink.db"
    # TiDB Cloud / MySQL con TLS: ruta al certificado CA (p. ej. /etc/ssl/certs/ca-certificates.crt).
    database_ssl_ca: str | None = None
    # CORS restringido a orígenes explícitos; nunca "*".
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    # Almacenamiento privado de documentos: fuera de cualquier ruta servida públicamente.
    upload_dir: str = "./storage/documents"
    max_upload_bytes: int = 10 * 1024 * 1024  # 10 MB
    # Multimedia del foro: directorio privado (se sirve solo vía API) y límites por tipo.
    forum_media_dir: str = "./storage/forum_media"
    farm_photo_dir: str = "./storage/farm_photos"
    task_media_dir: str = "./storage/task_media"
    # Clasificación documental con Gemini (envía el documento a Google). Desactivada por defecto:
    # política de la plataforma de no enviar datos a terceros; sin ella se usa la extracción local.
    document_ai_use_gemini: bool = False
    forum_image_max_bytes: int = 5 * 1024 * 1024  # 5 MB
    forum_video_max_bytes: int = 15 * 1024 * 1024  # 15 MB
    forum_media_per_post: int = 4
    forum_image_max_pixels: int = 40_000_000  # protección frente a "bombas de descompresión"
    # Agente IA (Gemini). SecretStr evita que la clave aparezca en logs o repr().
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-3.8-flash"
    gemini_timeout_seconds: int = 60
    agent_rate_limit_per_minute: int = 15
    # Motor del agente: auto (Ollama si está configurado; si no, local) · local · ollama · gemini.
    # local y ollama no envían datos a terceros; gemini envía la pregunta y el contexto mínimo a Google
    # y solo se usa si se elige explícitamente.
    agent_engine: str = "auto"
    # Ollama (modelo abierto y gratuito en tu propio servidor). Solo configurable por el operador, nunca por el cliente.
    ollama_url: str | None = None
    ollama_model: str = "llama3.2:3b"
    ollama_timeout_seconds: int = 60
    # Sesiones: token opaco en cookie HttpOnly; en BD solo se guarda su hash SHA-256.
    session_cookie_name: str = "agropelink_session"
    session_ttl_hours: int = 168  # 7 días
    cookie_secure: bool = True
    # Recuperación de contraseña: JWT firmado (HS256) con este secreto, válido 15 minutos y de un solo uso.
    # Obligatorio en producción; en desarrollo, si falta, se genera uno aleatorio por proceso.
    jwt_secret: SecretStr | None = None
    password_reset_ttl_minutes: int = 15
    # Base de los enlaces que se envían por correo (página /reset-password del frontend).
    frontend_url: str = "http://localhost:5173"
    # Tamaño máximo del cuerpo de una petición JSON (las subidas tienen su propio límite: max_upload_bytes).
    max_json_body_bytes: int = 64 * 1024
    agent_rate_limit_per_ip_per_minute: int = 30
    # Notificaciones del formulario de contacto. Sin SMTP_HOST no se envía correo (el mensaje queda en BD).
    contact_notify_to: str = "info@agropelink.es"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: SecretStr | None = None
    smtp_from: str = "info@agropelink.es"
    smtp_starttls: bool = True
    # Moderación: nº de infracción que provoca el bloqueo (2 = reincidir tras la advertencia oficial; la grave bloquea siempre).
    # Faltas: advertencia en la 1.ª y la 2.ª; bloqueo en la 3.ª. Las faltas caducan (el contador vuelve a 0)
    # tras `moderation_warning_ttl_hours` sin nuevas infracciones (rango acordado: 48–72 h).
    moderation_ban_after_warnings: int = 3
    moderation_warning_ttl_hours: int = 72
    # Análisis de documentos con IA: tamaño máximo enviado al modelo y caducidad de los borradores sin confirmar.
    document_ai_max_bytes: int = 8 * 1024 * 1024
    document_draft_ttl_hours: int = 24

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def session_cookie(self) -> str:
        """Nombre efectivo de la cookie. Con Secure se usa el prefijo `__Host-`: el navegador exige
        Secure, Path=/ y sin Domain, de modo que ni un subdominio ni HTTP pueden sobrescribirla."""
        return f"__Host-{self.session_cookie_name}" if self.cookie_secure else self.session_cookie_name


@lru_cache
def get_settings() -> Settings:
    return Settings()
