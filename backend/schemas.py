"""Esquemas Pydantic de entrada (Create/Update) y salida (Response).

Los esquemas de entrada usan `extra="forbid"` para rechazar campos no esperados
(evita asignación masiva de campos como `role`, `owner_id` o `file_url`).
"""

import datetime as dt
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator
from pydantic_core import PydanticCustomError

from models import (
    ApplicationStatus,
    DocumentStatus,
    DocumentType,
    ForumCategory,
    ModerationAction,
    ReportReason,
    ReportStatus,
    SupportCategory,
    TaskStatus,
    UserRole,
)
from sanitize import clean_text

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]
PositiveId = Annotated[int, Field(gt=0)]
# Las fechas se guardan como UTC sin zona (SQLite); al serializar se marcan explícitamente como UTC.
UtcDatetime = Annotated[dt.datetime, AfterValidator(lambda v: v if v.tzinfo else v.replace(tzinfo=dt.UTC))]


MIN_AGE = 18
UNDERAGE_MESSAGE = "Debes ser mayor de 18 años para registrarte en Agropelink."


def age_on(birth_date: dt.date, today: dt.date | None = None) -> int:
    """Años cumplidos a fecha de `today` (por defecto, hoy). Un nacido el 29/2 cumple el 1/3 en años no bisiestos."""
    today = today or dt.date.today()
    return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))


def _adult_birth_date(value: dt.date) -> dt.date:
    today = dt.date.today()
    if value > today or value.year < today.year - 120:
        raise PydanticCustomError("birth_date_invalid", "Introduce una fecha de nacimiento válida.")
    if age_on(value, today) < MIN_AGE:
        raise PydanticCustomError("underage", UNDERAGE_MESSAGE)
    return value


# Fecha de nacimiento de un adulto: al menos 18 años cumplidos a fecha de hoy.
AdultBirthDate = Annotated[dt.date, AfterValidator(_adult_birth_date)]


# Catálogo cerrado de avatares (personajes del sprite /media/avatar-sprite.webp). Solo se guarda el identificador.
Avatar = Literal["abeja", "vaca", "girasol", "aguacate", "mariquita", "tomate", "zanahoria", "agricultor", "margarita", "guisante"]


class InputSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- User ---------------------------------------------------------------------


class UserCreate(InputSchema):
    # `role` no se acepta del cliente: se asigna en servidor (por defecto USER).
    name: Name
    email: EmailStr
    password: Password


class UserUpdate(InputSchema):
    name: Name | None = None
    email: EmailStr | None = None
    password: Password | None = None


class UserResponse(ResponseSchema):
    # Nunca exponer `hashed_password`.
    id: int
    name: str
    email: str  # salida: ya validado al guardarse; revalidar aquí convertiría una fila antigua en un 500
    role: UserRole
    avatar: Avatar | None = None
    birth_date: dt.date | None = None
    is_active: bool = True
    # Moderación: advertencias acumuladas y advertencia oficial pendiente de aceptar (bloquea el panel con un modal).
    warnings_count: int = 0
    pending_warning_ack: bool = False


# --- Farm ---------------------------------------------------------------------


FarmLabel = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80), AfterValidator(lambda v: clean_text(v, multiline=False))]
Measure = Annotated[Decimal, Field(gt=0, le=1_000_000, max_digits=12, decimal_places=2)]
Money = Annotated[Decimal, Field(ge=0, le=100_000_000, max_digits=12, decimal_places=2)]


class FarmOperator(InputSchema):
    # Solo nombre y puesto: sin datos de contacto ni identificadores (minimización de datos, RGPD).
    name: FarmLabel
    position: FarmLabel


class FarmSchedule(InputSchema):
    name: FarmLabel  # p. ej. "Riego sector norte", "Tratamiento preventivo de mildiu"
    frequency: Literal["daily", "weekly", "biweekly", "monthly", "seasonal"]
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300), AfterValidator(clean_text)] | None = None


class FarmInput(InputSchema):
    name: FarmLabel
    kind: Literal["phytosanitary", "ferment", "fertilizer"]
    registry: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40), AfterValidator(lambda v: clean_text(v, multiline=False))] | None = None


class FarmProfile(InputSchema):
    """Ficha ampliada de la explotación (asistente multipaso). Todos los campos son opcionales."""

    surface_ha: Measure | None = None
    length_m: Measure | None = None
    width_m: Measure | None = None
    avg_workers: Annotated[int, Field(ge=0, le=10_000)] | None = None
    operators: Annotated[list[FarmOperator], Field(max_length=100)] = []
    crop_types: Annotated[list[FarmLabel], Field(max_length=30)] = []
    schedules: Annotated[list[FarmSchedule], Field(max_length=50)] = []
    labs: Annotated[list[FarmLabel], Field(max_length=20)] = []
    inputs: Annotated[list[FarmInput], Field(max_length=100)] = []
    budget_total: Money | None = None
    budget_spent: Money | None = None

    @field_validator("crop_types", "labs")
    @classmethod
    def _dedupe(cls, value: list[str]) -> list[str]:
        # Sin distinguir mayúsculas ("Tomate" = "tomate"); se conserva la primera grafía.
        seen: dict[str, str] = {}
        for item in value:
            seen.setdefault(item.casefold(), item)
        return list(seen.values())


class FarmCreate(FarmProfile):
    # `owner_id` se toma del usuario autenticado, no del cuerpo de la petición.
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)]
    location: ShortText


class FarmUpdate(FarmProfile):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)] | None = None
    location: ShortText | None = None


class FarmResponse(ResponseSchema):
    id: int
    name: str
    location: str
    owner_id: int
    has_photo: bool = False
    surface_ha: float | None = None
    length_m: float | None = None
    width_m: float | None = None
    avg_workers: int | None = None
    operators: list[dict[str, str]] = []
    crop_types: list[str] = []
    schedules: list[dict[str, str | None]] = []
    labs: list[str] = []
    inputs: list[dict[str, str | None]] = []
    budget_total: float | None = None
    budget_spent: float | None = None

    @field_validator("operators", "crop_types", "schedules", "labs", "inputs", mode="before")
    @classmethod
    def _none_to_list(cls, value: object) -> object:
        return value or []


# --- Sensores y analítica -----------------------------------------------------


class SensorReadingCreate(InputSchema):
    recorded_on: dt.date
    water_liters: Annotated[Decimal, Field(ge=0, le=100_000_000, max_digits=12, decimal_places=1)] | None = None
    soil_moisture_pct: Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=1)] | None = None

    @field_validator("recorded_on")
    @classmethod
    def _not_future(cls, value: dt.date) -> dt.date:
        if value > dt.date.today():
            raise PydanticCustomError("future_date", "La fecha de la lectura no puede ser futura.")
        return value


class SensorReadingResponse(ResponseSchema):
    id: int
    farm_id: int
    recorded_on: dt.date
    water_liters: float | None
    soil_moisture_pct: float | None
    source: str


class WaterMoisturePoint(BaseModel):
    date: dt.date
    water_liters: float | None
    soil_moisture_pct: float | None


class MonthlySpendPoint(BaseModel):
    month: int  # 1–12
    this_year: float
    last_year: float


class AnalyticsKpis(BaseModel):
    farms: int
    surface_ha: float
    pending_tasks: int
    documents_this_year: int
    water_liters_30d: float
    avg_moisture_7d: float | None
    inputs_spend_ytd: float
    inputs_spend_prev_ytd: float
    budget_total: float
    budget_spent: float


class AnalyticsOverview(BaseModel):
    kpis: AnalyticsKpis
    water_vs_moisture: list[WaterMoisturePoint]
    inputs_spend: list[MonthlySpendPoint]
    year: int


class DocumentFolder(BaseModel):
    farm_id: int
    farm_name: str
    year: int | None
    campaign: str | None
    count: int


# --- Task ---------------------------------------------------------------------


class TaskCreate(InputSchema):
    title: Title
    description: LongText | None = None
    date: dt.date
    status: TaskStatus = TaskStatus.PENDING
    farm_id: PositiveId


class TaskUpdate(InputSchema):
    title: Title | None = None
    description: LongText | None = None
    date: dt.date | None = None
    status: TaskStatus | None = None


class TaskResponse(ResponseSchema):
    id: int
    title: str
    description: str | None
    date: dt.date
    status: TaskStatus
    farm_id: int


# --- Document -----------------------------------------------------------------


def _one_line(min_length: int, max_length: int):  # type: ignore[no-untyped-def]
    """Texto libre de una línea: acotado y saneado (sin HTML ni caracteres de control)."""
    return Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length),
        AfterValidator(lambda v: clean_text(v, multiline=False)),
    ]


def _multi_line(min_length: int, max_length: int):  # type: ignore[no-untyped-def]
    return Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length), AfterValidator(clean_text)
    ]


Campaign = _one_line(2, 80)
Vendor = _one_line(1, 150)
Notes = _multi_line(0, 1000)
FiscalYear = Annotated[int, Field(ge=2000, le=2100)]
Amount = Annotated[Decimal, Field(ge=0, le=10_000_000, max_digits=12, decimal_places=2)]


class DocumentMeta(InputSchema):
    """Metadatos de indexación. El código de serie (`reference`) lo asigna siempre el servidor."""

    farm_id: PositiveId
    doc_type: DocumentType = DocumentType.OTHER
    fiscal_year: FiscalYear | None = None
    campaign: Campaign | None = None
    status: DocumentStatus = DocumentStatus.PENDING
    accrual_date: dt.date | None = None
    amount: Amount | None = None
    vendor: Vendor | None = None
    notes: Notes | None = None


class DocumentUpdate(InputSchema):
    farm_id: PositiveId | None = None
    doc_type: DocumentType | None = None
    campaign: Campaign | None = None
    status: DocumentStatus | None = None
    accrual_date: dt.date | None = None
    amount: Amount | None = None
    vendor: Vendor | None = None
    notes: Notes | None = None


class DocumentResponse(ResponseSchema):
    # La clave de almacenamiento (`file_url`) es interna y no se expone.
    id: int
    reference: str | None
    filename: str
    content_type: str | None
    size_bytes: int | None
    doc_type: DocumentType
    fiscal_year: int | None
    campaign: str | None
    status: DocumentStatus
    accrual_date: dt.date | None
    amount: float | None
    vendor: str | None
    notes: str | None
    farm_id: int
    is_draft: bool
    created_at: UtcDatetime | None


class DocumentList(BaseModel):
    items: list[DocumentResponse]
    total: int


class DocumentFacets(BaseModel):
    years: list[int]
    campaigns: list[str]


class DocumentProposal(BaseModel):
    """Metadatos propuestos por la IA. Son datos no confiables: se validan y el agricultor los confirma."""

    doc_type: DocumentType = DocumentType.OTHER
    fiscal_year: int | None = Field(default=None, ge=2000, le=2100)
    campaign: str | None = Field(default=None, max_length=80)
    accrual_date: dt.date | None = None
    amount: float | None = Field(default=None, ge=0, le=10_000_000)
    vendor: str | None = Field(default=None, max_length=150)
    status: DocumentStatus = DocumentStatus.PENDING
    farm_id: int | None = None
    summary: str | None = Field(default=None, max_length=400)


class DocumentDraftResponse(BaseModel):
    document: DocumentResponse
    proposal: DocumentProposal
    # gemini: análisis del modelo · heuristic: reglas locales (IA no disponible o sin respuesta válida)
    engine: Literal["gemini", "heuristic"]


# --- Agent --------------------------------------------------------------------

AgentText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class AgentHistoryItem(InputSchema):
    role: Literal["user", "model"]
    text: Annotated[str, StringConstraints(max_length=4000)]


class AgentChatRequest(InputSchema):
    message: AgentText
    # Contexto reciente de la conversación (el historial vive en el cliente, solo en memoria).
    history: Annotated[list[AgentHistoryItem], Field(max_length=20)] = []


class CreateTaskAction(BaseModel):
    """Acción propuesta por el agente. Nunca se ejecuta sin aprobación humana."""

    type: Literal["create_task"] = "create_task"
    title: Title
    description: LongText | None = None


class FileDocumentAction(BaseModel):
    """Propuesta de archivo documental a partir de instrucciones en lenguaje natural (falta adjuntar el archivo)."""

    type: Literal["file_document"] = "file_document"
    proposal: DocumentProposal


class AgentChatResponse(BaseModel):
    reply: str
    action: Annotated[CreateTaskAction | FileDocumentAction, Field(discriminator="type")] | None = None


# --- Contact (landing pública) ------------------------------------------------


class ContactCreate(InputSchema):
    name: Name
    phone: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\+?[0-9\s()-]{9,20}$")]
    email: EmailStr
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=3000)]
    # Consentimiento explícito obligatorio (RGPD): solo se acepta `true`.
    privacy_accepted: Literal[True]
    # Honeypot anti-spam: los usuarios reales lo dejan vacío.
    website: Annotated[str, StringConstraints(max_length=200)] = ""


class ContactResponse(BaseModel):
    status: Literal["received"] = "received"


# --- Auth ---------------------------------------------------------------------



def validate_password_strength(value: str) -> str:
    """Política de contraseña: 8–128 caracteres, al menos una letra, un número y un símbolo."""
    errors = []
    if not any(c.isalpha() for c in value):
        errors.append("una letra")
    if not any(c.isdigit() for c in value):
        errors.append("un número")
    if not any(not c.isalnum() and not c.isspace() for c in value):
        errors.append("un símbolo")
    if errors:
        raise ValueError("La contraseña debe incluir " + ", ".join(errors) + ".")
    return value


class RegisterRequest(InputSchema):
    name: Name
    email: EmailStr
    password: Password
    birth_date: AdultBirthDate

    @field_validator("password")
    @classmethod
    def _strong_password(cls, value: str) -> str:
        return validate_password_strength(value)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class LoginRequest(InputSchema):
    email: EmailStr
    # Sin política aquí: solo límites de tamaño (no se revela nada sobre el formato esperado).
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class ProfileUpdate(InputSchema):
    """Datos editables del propio perfil. El email, el rol y la contraseña no se cambian aquí."""

    name: Name
    birth_date: AdultBirthDate
    avatar: Avatar | None = None


class ForgotPasswordRequest(InputSchema):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class ResetPasswordRequest(InputSchema):
    token: Annotated[str, StringConstraints(strip_whitespace=True, min_length=20, max_length=2048)]
    new_password: Password

    @field_validator("new_password")
    @classmethod
    def _strong_password(cls, value: str) -> str:
        return validate_password_strength(value)


class MessageResponse(BaseModel):
    detail: str


# --- Forum --------------------------------------------------------------------

Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=24, pattern=r"^[\wÀ-ÿ\- ]+$")]


class ForumThreadCreate(InputSchema):
    # Imágenes/vídeos subidos antes con POST /forum/upload (máx. 4, solo del propio autor y sin usar).
    media_ids: Annotated[list[PositiveId], Field(max_length=4)] = []
    category: ForumCategory
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=8, max_length=160)]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=20, max_length=5000)]
    tags: Annotated[list[Tag], Field(max_length=5)] = []

    @field_validator("tags")
    @classmethod
    def _dedupe_tags(cls, value: list[str]) -> list[str]:
        seen: dict[str, str] = {}
        for tag in value:
            seen.setdefault(tag.lower(), tag.lower())
        return list(seen.values())


class ForumReplyCreate(InputSchema):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=3000)]


class ForumReportCreate(InputSchema):
    thread_id: PositiveId
    reply_id: PositiveId | None = None
    reason: ReportReason
    details: _multi_line(0, 500) | None = None


class ForumAuthor(ResponseSchema):
    # Solo el nombre público y el avatar: nunca el email.
    id: int
    name: str
    avatar: Avatar | None = None


class ForumMediaResponse(BaseModel):
    id: int
    kind: Literal["image", "video"]
    content_type: str
    url: str  # ruta relativa a la API: /forum/media/<clave>
    size_bytes: int
    width: int | None = None
    height: int | None = None


class ForumReplyResponse(ResponseSchema):
    id: int
    body: str
    created_at: UtcDatetime
    author: ForumAuthor


class ForumThreadSummary(BaseModel):
    id: int
    category: ForumCategory
    title: str
    excerpt: str
    tags: list[str]
    author: ForumAuthor
    created_at: UtcDatetime
    last_activity_at: UtcDatetime
    reply_count: int
    media_count: int = 0


class ForumThreadList(BaseModel):
    items: list[ForumThreadSummary]
    total: int


class ForumThreadDetail(ResponseSchema):
    id: int
    category: ForumCategory
    title: str
    body: str
    tags: list[str]
    author: ForumAuthor
    created_at: UtcDatetime
    last_activity_at: UtcDatetime
    media: list[ForumMediaResponse] = []
    replies: list[ForumReplyResponse]


class ForumCategoryStat(BaseModel):
    category: ForumCategory
    thread_count: int


# --- Market -------------------------------------------------------------------


class FuelPriceResponse(BaseModel):
    product: Literal["gasoleo_b"] = "gasoleo_b"
    # live: recién obtenido · cached: último dato oficial conocido · estimate: valor de referencia de contingencia
    status: Literal["live", "cached", "estimate"]
    region: str
    region_avg: float
    region_min: float | None = None
    region_max: float | None = None
    region_week_ago_avg: float | None = None
    region_weekly_change_pct: float | None = None
    almeria_avg: float | None = None
    spain_avg: float | None = None
    stations: int = 0
    source_updated_at: str | None = None
    fetched_at: UtcDatetime
    source: str
    note: str | None = None


# --- Moderación (perfil del usuario) -------------------------------------------------


class ModerationEventResponse(ResponseSchema):
    id: int
    action: ModerationAction
    reason: str
    excerpt: str | None
    automatic: bool
    created_at: UtcDatetime


# --- Alta como agricultor ------------------------------------------------------------

Phone = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\+?[0-9\s()-]{9,20}$")]


class FarmerApplicationCreate(InputSchema):
    farm_name: _one_line(2, 150)
    location: _one_line(2, 255)
    crops: _one_line(2, 300)
    surface_ha: Annotated[Decimal, Field(gt=0, le=100_000, max_digits=10, decimal_places=2)] | None = None
    phone: Phone
    message: _multi_line(0, 1000) | None = None
    # Consentimiento explícito para tratar los datos de la explotación (RGPD).
    privacy_accepted: Literal[True]


class FarmerApplicationResponse(ResponseSchema):
    id: int
    farm_name: str
    location: str
    crops: str
    surface_ha: float | None
    phone: str
    message: str | None
    status: ApplicationStatus
    created_at: UtcDatetime
    reviewed_at: UtcDatetime | None
    review_note: str | None


# --- Soporte -------------------------------------------------------------------------


class SupportTicketCreate(InputSchema):
    category: SupportCategory
    subject: _one_line(4, 150)
    message: _multi_line(10, 3000)


class SupportTicketResponse(ResponseSchema):
    id: int
    category: SupportCategory
    subject: str
    created_at: UtcDatetime


# --- Administración ------------------------------------------------------------------


class AdminMetrics(BaseModel):
    users_total: int
    users_by_role: dict[UserRole, int]
    active_users: int  # con al menos una sesión vigente
    new_users_30d: int
    banned_users: int
    farms: int
    tasks_by_status: dict[TaskStatus, int]
    documents: int
    documents_by_type: dict[DocumentType, int]
    forum_threads: int
    forum_replies: int
    open_reports: int
    pending_applications: int
    open_support_tickets: int


class AdminUserRow(BaseModel):
    id: int
    name: str
    email: str  # salida: ya validado al guardarse; revalidar aquí convertiría una fila antigua en un 500
    role: UserRole
    birth_date: dt.date | None
    age: int | None
    warnings_count: int
    pending_warning_ack: bool
    is_active: bool
    is_banned: bool
    ban_reason: str | None
    banned_at: UtcDatetime | None
    created_at: UtcDatetime | None
    last_login_at: UtcDatetime | None
    farm_count: int


class AdminUserList(BaseModel):
    items: list[AdminUserRow]
    total: int


class AdminUserCreate(InputSchema):
    """Alta directa desde el panel de administración (el administrador elige el rol)."""

    name: Name
    email: EmailStr
    password: Password
    role: UserRole
    birth_date: AdultBirthDate

    @field_validator("password")
    @classmethod
    def _strong_password(cls, value: str) -> str:
        return validate_password_strength(value)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class QuickBanRequest(InputSchema):
    reason: _one_line(0, 300) | None = None


class BanResult(BaseModel):
    id: int
    is_banned: bool
    ban_reason: str | None


class RoleUpdate(InputSchema):
    role: UserRole


class BanRequest(InputSchema):
    reason: _one_line(4, 300)


class AdminFarmRow(BaseModel):
    id: int
    name: str
    location: str
    owner_id: int
    owner_name: str
    task_count: int
    document_count: int


class AdminApplicationRow(FarmerApplicationResponse):
    user_id: int
    user_name: str
    user_email: str  # salida: ya validado al guardarse; revalidar aquí convertiría una fila antigua en un 500


class ApplicationReview(InputSchema):
    note: _one_line(0, 300) | None = None
    # Al aprobar: crea la primera finca con los datos de la solicitud si el usuario aún no tiene ninguna.
    create_farm: bool = True


class ReportedContent(BaseModel):
    kind: Literal["thread", "reply"]
    thread_id: int
    reply_id: int | None
    thread_title: str
    body: str
    author: ForumAuthor
    deleted: bool


class AdminReportRow(BaseModel):
    id: int
    reason: ReportReason
    details: str | None
    status: ReportStatus
    created_at: UtcDatetime
    reporter: ForumAuthor
    content: ReportedContent
    resolution_note: str | None


class ReportResolve(InputSchema):
    # dismiss: sin infracción · remove: retirar el contenido · remove_and_ban: retirarlo y bloquear al autor
    action: Literal["dismiss", "remove", "remove_and_ban"]
    note: _one_line(0, 300) | None = None


class RemovedContentRow(BaseModel):
    kind: Literal["thread", "reply"]
    id: int
    thread_id: int
    thread_title: str
    body: str
    author: ForumAuthor
    deleted_at: UtcDatetime
    deleted_reason: str | None


class AdminModerationEvent(ModerationEventResponse):
    user: ForumAuthor


class AdminSupportRow(BaseModel):
    id: int
    category: SupportCategory
    subject: str
    message: str
    is_closed: bool
    created_at: UtcDatetime
    user: ForumAuthor
    user_email: str  # salida: ya validado al guardarse; revalidar aquí convertiría una fila antigua en un 500
