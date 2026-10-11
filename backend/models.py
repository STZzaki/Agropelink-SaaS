import datetime as dt
import enum
from typing import Any

from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def _utcnow() -> dt.datetime:
    # Default en Python (UTC sin zona, como security.utcnow): las columnas añadidas por migración
    # en SQLite no tienen DEFAULT en BD, así que no se puede depender solo de server_default.
    return dt.datetime.now(dt.UTC).replace(tzinfo=None)


class UserRole(str, enum.Enum):
    """RBAC. `user`: portal reducido · `farmer`: panel agronómico completo · `admin`: control total."""

    ADMIN = "admin"
    FARMER = "farmer"
    USER = "user"


class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    # Toda cuenta nueva nace como `user`; solo un administrador la promueve a `farmer` (alta aprobada).
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, native_enum=False, length=20), default=UserRole.USER, server_default=UserRole.USER.name
    )
    created_at: Mapped[dt.datetime | None] = mapped_column(DateTime, default=_utcnow, server_default=func.now())
    last_login_at: Mapped[dt.datetime | None] = mapped_column(DateTime, default=None)
    # Solo cuentas de mayores de 18 años (validado en el registro). NULL en cuentas anteriores al control.
    birth_date: Mapped[dt.date | None] = mapped_column(Date, default=None)
    # Avatar elegido de un catálogo cerrado (avatar1…avatar5). No se admiten fotos subidas por el usuario.
    avatar: Mapped[str | None] = mapped_column(String(20), default=None)
    # Moderación: advertencias acumuladas, advertencia pendiente de aceptar y bloqueo permanente.
    warnings_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    pending_warning_ack: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", index=True)
    banned_at: Mapped[dt.datetime | None] = mapped_column(DateTime, default=None)
    ban_reason: Mapped[str | None] = mapped_column(String(300), default=None)

    farms: Mapped[list["Farm"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )

    @property
    def is_active(self) -> bool:
        """Cuenta operativa: no bloqueada por moderación."""
        return not self.is_banned


class Farm(Base):
    __tablename__ = "farms"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    location: Mapped[str] = mapped_column(String(255))
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Ficha completa de la explotación (asistente de alta). Todo opcional: las granjas antiguas siguen válidas.
    photo_key: Mapped[str | None] = mapped_column(String(64), default=None)  # imagen recodificada, privada
    surface_ha: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=None)
    length_m: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=None)
    width_m: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=None)
    avg_workers: Mapped[int | None] = mapped_column(Integer, default=None)
    # Listas estructuradas (validadas con Pydantic antes de guardarse):
    operators: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, default=None)  # [{name, position}]
    crop_types: Mapped[list[str] | None] = mapped_column(JSON, default=None)
    schedules: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, default=None)  # [{name, frequency, notes}]
    labs: Mapped[list[str] | None] = mapped_column(JSON, default=None)
    inputs: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, default=None)  # [{name, kind, registry}]
    budget_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), default=None)
    budget_spent: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), default=None)

    owner: Mapped[User] = relationship(back_populates="farms")

    @property
    def has_photo(self) -> bool:
        return self.photo_key is not None

    tasks: Mapped[list["Task"]] = relationship(back_populates="farm", cascade="all, delete-orphan")
    documents: Mapped[list["Document"]] = relationship(
        back_populates="farm", cascade="all, delete-orphan"
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, default=None)
    date: Mapped[dt.date] = mapped_column(Date)
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, native_enum=False, length=20), default=TaskStatus.PENDING
    )
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)

    farm: Mapped[Farm] = relationship(back_populates="tasks")


class DocumentType(str, enum.Enum):
    INVOICE_FUEL = "invoice_fuel"
    INVOICE_PHYTO = "invoice_phyto"
    INVOICE_SEEDS = "invoice_seeds"
    INVOICE_OTHER = "invoice_other"
    DELIVERY_NOTE = "delivery_note"
    SOIL_ANALYSIS = "soil_analysis"
    WATER_ANALYSIS = "water_analysis"
    FARM_LOGBOOK = "farm_logbook"
    CERTIFICATE = "certificate"
    CONTRACT = "contract"
    OTHER = "other"


# Serie documental del código AGRO-<año>-<serie>-<nº>. Todas las facturas comparten la serie FCT.
DOCUMENT_SERIES: dict[DocumentType, str] = {
    DocumentType.INVOICE_FUEL: "FCT",
    DocumentType.INVOICE_PHYTO: "FCT",
    DocumentType.INVOICE_SEEDS: "FCT",
    DocumentType.INVOICE_OTHER: "FCT",
    DocumentType.DELIVERY_NOTE: "ALB",
    DocumentType.SOIL_ANALYSIS: "ASU",
    DocumentType.WATER_ANALYSIS: "AAG",
    DocumentType.FARM_LOGBOOK: "CUA",
    DocumentType.CERTIFICATE: "CER",
    DocumentType.CONTRACT: "CTR",
    DocumentType.OTHER: "OTR",
}


class DocumentStatus(str, enum.Enum):
    PENDING = "pending"  # pendiente de pago / de tramitar
    PAID = "paid"
    ARCHIVED = "archived"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Código de serie único e indexable. NULL solo mientras es un borrador pendiente de confirmar.
    reference: Mapped[str | None] = mapped_column(String(32), unique=True, index=True, default=None)
    filename: Mapped[str] = mapped_column(String(255))
    # Clave en el almacenamiento privado (UUIDv4 sin extensión), generada por el servidor. Nunca la elige el cliente.
    file_url: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str | None] = mapped_column(String(50), default=None)
    size_bytes: Mapped[int | None] = mapped_column(Integer, default=None)
    sha256: Mapped[str | None] = mapped_column(String(64), default=None)
    doc_type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType, native_enum=False, length=20),
        default=DocumentType.OTHER,
        server_default=DocumentType.OTHER.name,
        index=True,
    )
    fiscal_year: Mapped[int | None] = mapped_column(Integer, default=None, index=True)
    campaign: Mapped[str | None] = mapped_column(String(80), default=None, index=True)
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, native_enum=False, length=20),
        default=DocumentStatus.PENDING,
        server_default=DocumentStatus.PENDING.name,
    )
    accrual_date: Mapped[dt.date | None] = mapped_column(Date, default=None)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), default=None)
    vendor: Mapped[str | None] = mapped_column(String(150), default=None)
    notes: Mapped[str | None] = mapped_column(String(1000), default=None)
    # Borrador de la clasificación con IA: no aparece en el archivo hasta que el agricultor lo confirma.
    is_draft: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", index=True)
    created_at: Mapped[dt.datetime | None] = mapped_column(DateTime, default=_utcnow, server_default=func.now())
    parsed_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, default=None)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)

    farm: Mapped[Farm] = relationship(back_populates="documents")


class DocumentSequence(Base):
    """Contador por (año, serie) para los códigos AGRO-AAAA-XXX-NNNN."""

    __tablename__ = "document_sequences"
    __table_args__ = (UniqueConstraint("year", "series"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int] = mapped_column(Integer)
    series: Mapped[str] = mapped_column(String(3))
    last: Mapped[int] = mapped_column(Integer, default=0)


class ContactMessage(Base):
    """Mensajes del formulario público de la landing."""

    __tablename__ = "contact_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(20))
    email: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    privacy_accepted_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserSession(Base):
    """Sesión de usuario. El token viaja en una cookie HttpOnly; aquí solo se guarda su hash."""

    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime)
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime, index=True)

    user: Mapped[User] = relationship()


class ForumCategory(str, enum.Enum):
    PLAGAS = "plagas"
    RIEGO = "riego"
    LONJAS = "lonjas"
    MAQUINARIA = "maquinaria"


class ForumThread(Base):
    __tablename__ = "forum_threads"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[ForumCategory] = mapped_column(Enum(ForumCategory, native_enum=False, length=20), index=True)
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, index=True)
    last_activity_at: Mapped[dt.datetime] = mapped_column(DateTime, index=True)
    # Borrado lógico por moderación: deja de mostrarse pero queda para auditoría.
    deleted_at: Mapped[dt.datetime | None] = mapped_column(DateTime, default=None, index=True)
    deleted_reason: Mapped[str | None] = mapped_column(String(300), default=None)

    author: Mapped[User] = relationship()
    replies: Mapped[list["ForumReply"]] = relationship(
        back_populates="thread", cascade="all, delete-orphan", order_by="ForumReply.created_at"
    )


class ForumReply(Base):
    __tablename__ = "forum_replies"

    id: Mapped[int] = mapped_column(primary_key=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("forum_threads.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime)
    deleted_at: Mapped[dt.datetime | None] = mapped_column(DateTime, default=None, index=True)
    deleted_reason: Mapped[str | None] = mapped_column(String(300), default=None)

    thread: Mapped[ForumThread] = relationship(back_populates="replies")
    author: Mapped[User] = relationship()


# --- Moderación del foro --------------------------------------------------------------


class ReportReason(str, enum.Enum):
    SPAM = "spam"
    INSULTS = "insults"
    HATE = "hate"
    DANGEROUS = "dangerous"  # contenido ilegal, peligroso o malicioso
    MISINFORMATION = "misinformation"
    INAPPROPRIATE = "inappropriate"
    OTHER = "other"


class ReportStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED = "resolved"  # se retiró el contenido
    DISMISSED = "dismissed"


class ForumReport(Base):
    """Denuncia de un usuario sobre un hilo o una respuesta: ticket para el panel de administración."""

    __tablename__ = "forum_reports"
    __table_args__ = (UniqueConstraint("reporter_id", "thread_id", "reply_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("forum_threads.id", ondelete="CASCADE"), index=True)
    reply_id: Mapped[int | None] = mapped_column(ForeignKey("forum_replies.id", ondelete="CASCADE"), default=None)
    reason: Mapped[ReportReason] = mapped_column(Enum(ReportReason, native_enum=False, length=20))
    details: Mapped[str | None] = mapped_column(String(500), default=None)
    status: Mapped[ReportStatus] = mapped_column(
        Enum(ReportStatus, native_enum=False, length=20), default=ReportStatus.OPEN, index=True
    )
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, index=True)
    resolved_at: Mapped[dt.datetime | None] = mapped_column(DateTime, default=None)
    resolved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    resolution_note: Mapped[str | None] = mapped_column(String(300), default=None)

    reporter: Mapped[User] = relationship(foreign_keys=[reporter_id])
    thread: Mapped[ForumThread] = relationship()
    reply: Mapped[ForumReply | None] = relationship()


class ModerationAction(str, enum.Enum):
    WARNING = "warning"  # mensaje bloqueado + aviso en el perfil
    BAN = "ban"
    UNBAN = "unban"
    CONTENT_REMOVED = "content_removed"  # retirada manual por un administrador


class ModerationEvent(Base):
    """Historial de moderación (automática y manual), visible para el afectado y el administrador."""

    __tablename__ = "moderation_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    action: Mapped[ModerationAction] = mapped_column(Enum(ModerationAction, native_enum=False, length=20))
    reason: Mapped[str] = mapped_column(String(300))
    # Extracto del contenido bloqueado o retirado (saneado y truncado) para la auditoría.
    excerpt: Mapped[str | None] = mapped_column(String(500), default=None)
    automatic: Mapped[bool] = mapped_column(Boolean, default=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, index=True)

    user: Mapped[User] = relationship(foreign_keys=[user_id])


# --- Altas de agricultor y soporte ------------------------------------------------------


class ApplicationStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class FarmerApplication(Base):
    """Solicitud de un usuario estándar para obtener el rol `farmer`."""

    __tablename__ = "farmer_applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    farm_name: Mapped[str] = mapped_column(String(150))
    location: Mapped[str] = mapped_column(String(255))
    crops: Mapped[str] = mapped_column(String(300))
    surface_ha: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=None)
    phone: Mapped[str] = mapped_column(String(20))
    message: Mapped[str | None] = mapped_column(String(1000), default=None)
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(ApplicationStatus, native_enum=False, length=20), default=ApplicationStatus.PENDING, index=True
    )
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, index=True)
    reviewed_at: Mapped[dt.datetime | None] = mapped_column(DateTime, default=None)
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    review_note: Mapped[str | None] = mapped_column(String(300), default=None)

    user: Mapped[User] = relationship(foreign_keys=[user_id])


class SupportCategory(str, enum.Enum):
    TECHNICAL = "technical"
    LEGAL = "legal"
    ACCOUNT = "account"
    OTHER = "other"


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category: Mapped[SupportCategory] = mapped_column(Enum(SupportCategory, native_enum=False, length=20))
    subject: Mapped[str] = mapped_column(String(150))
    message: Mapped[str] = mapped_column(Text)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, index=True)

    user: Mapped[User] = relationship()


class ForumMedia(Base):
    """Imagen o vídeo de un hilo del foro. Se sube antes de publicar y se vincula al crear el hilo."""

    __tablename__ = "forum_media"

    id: Mapped[int] = mapped_column(primary_key=True)
    # UUIDv4 + extensión asignada por el servidor según el tipo real validado.
    storage_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    content_type: Mapped[str] = mapped_column(String(30))
    kind: Mapped[str] = mapped_column(String(10))  # image | video
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    width: Mapped[int | None] = mapped_column(Integer, default=None)
    height: Mapped[int | None] = mapped_column(Integer, default=None)
    uploader_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    thread_id: Mapped[int | None] = mapped_column(ForeignKey("forum_threads.id", ondelete="CASCADE"), default=None, index=True)
    # Prueba de la aceptación expresa de derechos y responsabilidad legal sobre el contenido.
    rights_accepted_at: Mapped[dt.datetime] = mapped_column(DateTime)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, index=True)


class SensorReading(Base):
    """Lectura de riego/humedad de una finca: de sensores IoT o registrada a mano por el agricultor."""

    __tablename__ = "sensor_readings"

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    recorded_on: Mapped[dt.date] = mapped_column(Date, index=True)
    water_liters: Mapped[Decimal | None] = mapped_column(Numeric(12, 1), default=None)
    soil_moisture_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 1), default=None)
    source: Mapped[str] = mapped_column(String(10), default="manual")  # manual | iot
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_utcnow)
