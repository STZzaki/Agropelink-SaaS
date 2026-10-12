"""Archivo documental indexado: subida directa, clasificación asistida por IA, filtros y descarga segura."""

import datetime as dt
import logging
import urllib.parse
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy import case, delete, func, or_, select
from sqlalchemy.orm import Session

from config import get_settings
from deps import DbSession, FarmerUser, get_owned_farm
from document_ai import FarmRef, classify_document
from document_index import assign_reference
from models import Document, DocumentNote, DocumentStatus, DocumentType, Farm, User, UserRole
from ratelimit import SlidingWindowLimiter
from schemas import (
    DocumentDraftResponse,
    DocumentFacets,
    DocumentFolder,
    DocumentList,
    DocumentMeta,
    DocumentNoteCreate,
    DocumentNoteResponse,
    DocumentNoteUpdate,
    DocumentReminder,
    DocumentResponse,
    DocumentUpdate,
)
from security import utcnow
from storage import delete_stored, iter_stored, read_stored, sanitize_filename, save_upload

router = APIRouter(prefix="/documents", tags=["documents"])
logger = logging.getLogger("agropelink.documents")

# El análisis con IA tiene coste: límite por usuario.
_analyze_by_user = SlidingWindowLimiter(10, 60, "Demasiados análisis seguidos. Espera un minuto.")


def _owned_document(db: Session, document_id: int, user: User, *, drafts: bool = False, allow_admin: bool = False) -> Document:
    """Documento de una finca del usuario (IDOR: 404 si es ajeno). `allow_admin`: lectura administrativa global."""
    stmt = select(Document).join(Document.farm).where(Document.id == document_id, Document.is_draft.is_(drafts))
    if not (allow_admin and user.role == UserRole.ADMIN):
        stmt = stmt.where(Farm.owner_id == user.id)
    document = db.scalar(stmt)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return document


def _validate_meta(raw: dict[str, Any]) -> DocumentMeta:
    try:
        return DocumentMeta.model_validate({k: v for k, v in raw.items() if v not in (None, "")})
    except ValidationError as exc:
        raise RequestValidationError(exc.errors(include_url=False, include_context=False)) from None


def _apply_meta(document: Document, meta: DocumentMeta) -> None:
    for field, value in meta.model_dump(exclude={"farm_id"}).items():
        setattr(document, field, value)
    document.farm_id = meta.farm_id
    if document.fiscal_year is None:
        document.fiscal_year = document.accrual_date.year if document.accrual_date else utcnow().year


def _purge_stale_drafts(db: Session, user: User) -> None:
    """Borradores de IA no confirmados y caducados: se eliminan de BD y de disco."""
    limit = utcnow() - dt.timedelta(hours=get_settings().document_draft_ttl_hours)
    stale = db.scalars(
        select(Document).join(Document.farm).where(Farm.owner_id == user.id, Document.is_draft.is_(True), Document.created_at < limit)
    ).all()
    for document in stale:
        delete_stored(document.file_url)
        db.delete(document)
    if stale:
        db.commit()


def _notes_summary(db: Session, document_ids: list[int]) -> dict[int, tuple[int, dt.date | None]]:
    """(nº de notas, próximo recordatorio pendiente) por documento, en una sola consulta agregada."""
    if not document_ids:
        return {}
    pending = case((DocumentNote.done.is_(False), DocumentNote.remind_on))
    rows = db.execute(
        select(DocumentNote.document_id, func.count(DocumentNote.id), func.min(pending))
        .where(DocumentNote.document_id.in_(document_ids))
        .group_by(DocumentNote.document_id)
    )
    return {doc_id: (count, nxt) for doc_id, count, nxt in rows}


def _with_notes(document: Document, summary: dict[int, tuple[int, dt.date | None]]) -> DocumentResponse:
    response = DocumentResponse.model_validate(document)
    response.note_count, response.next_reminder = summary.get(document.id, (0, None))
    return response


def _user_farms(db: Session, user: User) -> list[FarmRef]:
    rows = db.execute(select(Farm.id, Farm.name, Farm.location).where(Farm.owner_id == user.id).order_by(Farm.id)).all()
    return [FarmRef(id=r.id, name=r.name, location=r.location) for r in rows]


@router.get("", response_model=DocumentList)
def list_documents(
    db: DbSession,
    user: FarmerUser,
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    campaign: Annotated[str | None, Query(max_length=80)] = None,
    doc_type: DocumentType | None = None,
    doc_status: Annotated[DocumentStatus | None, Query(alias="status")] = None,
    farm_id: Annotated[int | None, Query(gt=0)] = None,
    q: Annotated[str | None, Query(min_length=2, max_length=60)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> DocumentList:
    """Archivo del agricultor con filtros combinables. La búsqueda (código de serie, nombre o proveedor) es parametrizada."""
    filters = [Farm.owner_id == user.id, Document.is_draft.is_(False)]
    if year is not None:
        filters.append(Document.fiscal_year == year)
    if campaign:
        filters.append(Document.campaign == campaign)
    if doc_type is not None:
        filters.append(Document.doc_type == doc_type)
    if doc_status is not None:
        filters.append(Document.status == doc_status)
    if farm_id is not None:
        filters.append(Document.farm_id == farm_id)
    if q:
        term = q.strip()
        filters.append(
            or_(
                Document.reference.contains(term.upper(), autoescape=True),
                Document.filename.contains(term, autoescape=True),
                Document.vendor.contains(term, autoescape=True),
            )
        )
    base = select(Document).join(Document.farm).where(*filters)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = db.scalars(base.order_by(Document.created_at.desc(), Document.id.desc()).limit(limit).offset(offset)).all()
    summary = _notes_summary(db, [d.id for d in items])
    return DocumentList(items=[_with_notes(d, summary) for d in items], total=total)


@router.get("/facets", response_model=DocumentFacets)
def document_facets(db: DbSession, user: FarmerUser) -> DocumentFacets:
    """Valores disponibles para los filtros (años y campañas con documentos)."""
    owned = select(Document).join(Document.farm).where(Farm.owner_id == user.id, Document.is_draft.is_(False)).subquery()
    years = db.scalars(select(owned.c.fiscal_year).distinct().where(owned.c.fiscal_year.is_not(None)).order_by(owned.c.fiscal_year.desc())).all()
    campaigns = db.scalars(select(owned.c.campaign).distinct().where(owned.c.campaign.is_not(None)).order_by(owned.c.campaign)).all()
    return DocumentFacets(years=list(years), campaigns=list(campaigns))


@router.get("/folders", response_model=list[DocumentFolder])
def document_folders(db: DbSession, user: FarmerUser) -> list[DocumentFolder]:
    """Árbol de carpetas del archivo: Finca → Año → Cosecha/campaña, con el nº de documentos de cada una."""
    rows = db.execute(
        select(Farm.id, Farm.name, Document.fiscal_year, Document.campaign, func.count(Document.id))
        .join(Document.farm)
        .where(Farm.owner_id == user.id, Document.is_draft.is_(False))
        .group_by(Farm.id, Farm.name, Document.fiscal_year, Document.campaign)
        .order_by(Farm.name, Document.fiscal_year.desc(), Document.campaign)
    ).all()
    return [DocumentFolder(farm_id=f, farm_name=n, year=y, campaign=c, count=k) for f, n, y, c, k in rows]


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    db: DbSession,
    user: FarmerUser,
    file: Annotated[UploadFile, File(description="PDF o imagen (PNG, JPEG, WEBP). Máx. 10 MB.")],
    farm_id: Annotated[int, Form(gt=0)],
    doc_type: Annotated[str | None, Form(max_length=20)] = None,
    fiscal_year: Annotated[str | None, Form(max_length=4)] = None,
    campaign: Annotated[str | None, Form(max_length=80)] = None,
    doc_status: Annotated[str | None, Form(alias="status", max_length=20)] = None,
    accrual_date: Annotated[str | None, Form(max_length=10)] = None,
    amount: Annotated[str | None, Form(max_length=16)] = None,
    vendor: Annotated[str | None, Form(max_length=150)] = None,
    notes: Annotated[str | None, Form(max_length=1000)] = None,
) -> Document:
    """Subida directa con metadatos de indexación. El servidor asigna el código de serie único."""
    meta = _validate_meta(
        {
            "farm_id": farm_id,
            "doc_type": doc_type,
            "fiscal_year": fiscal_year,
            "campaign": campaign,
            "status": doc_status,
            "accrual_date": accrual_date,
            "amount": amount,
            "vendor": vendor,
            "notes": notes,
        }
    )
    get_owned_farm(db, meta.farm_id, user)

    stored = await save_upload(file)
    document = Document(
        filename=sanitize_filename(file.filename),
        file_url=stored.storage_key,
        content_type=stored.content_type,
        size_bytes=stored.size_bytes,
        sha256=stored.sha256,
    )
    _apply_meta(document, meta)
    try:
        db.add(document)
        assign_reference(db, document)
        db.commit()
    except Exception:
        db.rollback()
        delete_stored(stored.storage_key)
        raise
    db.refresh(document)
    return document


@router.post("/analyze", response_model=DocumentDraftResponse, status_code=status.HTTP_201_CREATED)
async def analyze_document(
    db: DbSession,
    user: FarmerUser,
    file: Annotated[UploadFile, File(description="PDF o imagen (PNG, JPEG, WEBP). Máx. 10 MB.")],
    instructions: Annotated[str, Form(max_length=2000)] = "",
) -> DocumentDraftResponse:
    """Sube el archivo como borrador y propone sus metadatos con IA. No se archiva hasta `POST /{id}/confirm`."""
    _analyze_by_user.hit(f"user:{user.id}")
    farms = _user_farms(db, user)
    if not farms:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Registra primero una finca para archivar documentos.")
    _purge_stale_drafts(db, user)

    stored = await save_upload(file)
    filename = sanitize_filename(file.filename)
    try:
        data = read_stored(stored.storage_key, get_settings().document_ai_max_bytes)
        proposal, engine = await classify_document(
            data=data, content_type=stored.content_type, filename=filename, instructions=instructions.strip(), farms=farms
        )
        document = Document(
            filename=filename,
            file_url=stored.storage_key,
            content_type=stored.content_type,
            size_bytes=stored.size_bytes,
            sha256=stored.sha256,
            is_draft=True,
            farm_id=proposal.farm_id or farms[0].id,
            doc_type=proposal.doc_type,
            fiscal_year=proposal.fiscal_year,
            campaign=proposal.campaign,
            status=proposal.status,
            accrual_date=proposal.accrual_date,
            amount=proposal.amount,
            vendor=proposal.vendor,
            parsed_data={"engine": engine, "summary": proposal.summary},
        )
        db.add(document)
        db.commit()
    except BaseException:
        db.rollback()
        delete_stored(stored.storage_key)
        raise
    db.refresh(document)
    return DocumentDraftResponse(document=DocumentResponse.model_validate(document), proposal=proposal, engine=engine)


@router.post("/{document_id}/confirm", response_model=DocumentResponse)
def confirm_document(document_id: int, payload: DocumentMeta, db: DbSession, user: FarmerUser) -> Document:
    """Aprobación del agricultor: aplica los metadatos (revisados), asigna el código de serie y archiva."""
    document = _owned_document(db, document_id, user, drafts=True)
    get_owned_farm(db, payload.farm_id, user)
    _apply_meta(document, payload)
    document.is_draft = False
    document.created_at = utcnow()
    assign_reference(db, document)
    db.commit()
    db.refresh(document)
    return document


@router.patch("/{document_id}", response_model=DocumentResponse)
def update_document(document_id: int, payload: DocumentUpdate, db: DbSession, user: FarmerUser) -> Document:
    """Corrige metadatos. El código de serie es un identificador estable y no cambia."""
    document = _owned_document(db, document_id, user)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("farm_id") is not None:
        get_owned_farm(db, changes["farm_id"], user)
    for field in ("farm_id", "doc_type", "status"):
        if field in changes and changes[field] is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"'{field}' cannot be null")
    for field, value in changes.items():
        setattr(document, field, value)
    db.commit()
    db.refresh(document)
    return document


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: int, db: DbSession, user: FarmerUser) -> Response:
    """Elimina un documento archivado o descarta un borrador de la IA (registro y archivo en disco)."""
    stmt = select(Document).join(Document.farm).where(Document.id == document_id, Farm.owner_id == user.id)
    document = db.scalar(stmt)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    storage_key = document.file_url
    # Notas explícitamente (no se depende de que el motor aplique ON DELETE CASCADE).
    db.execute(delete(DocumentNote).where(DocumentNote.document_id == document.id))
    db.execute(delete(Document).where(Document.id == document.id))
    db.commit()
    delete_stored(storage_key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _content_disposition(filename: str) -> str:
    ascii_name = "".join(ch if ch.isascii() and ch.isprintable() and ch not in '"\\;' else "_" for ch in filename) or "documento"
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{urllib.parse.quote(filename, safe='')}"


@router.get("/{document_id}/download")
def download_document(document_id: int, db: DbSession, user: FarmerUser) -> StreamingResponse:
    """Streaming autenticado. Siempre como adjunto y con `nosniff`: el navegador nunca lo interpreta ni lo ejecuta."""
    document = _owned_document(db, document_id, user, allow_admin=True)
    if user.role == UserRole.ADMIN and document.farm.owner_id != user.id:
        logger.info("Descarga administrativa del documento %s por el usuario %s", document.reference, user.id)
    headers = {
        "Content-Disposition": _content_disposition(document.filename),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "no-store",
    }
    return StreamingResponse(
        iter_stored(document.file_url), media_type=document.content_type or "application/octet-stream", headers=headers
    )


# --- Notas y recordatorios ----------------------------------------------------------------------------

MAX_NOTES_PER_DOCUMENT = 50


def _owned_note(db: Session, document_id: int, note_id: int, user: User) -> DocumentNote:
    _owned_document(db, document_id, user)
    note = db.scalar(select(DocumentNote).where(DocumentNote.id == note_id, DocumentNote.document_id == document_id))
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    return note


@router.get("/reminders", response_model=list[DocumentReminder])
def reminders(
    db: DbSession,
    user: FarmerUser,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
) -> list[DocumentReminder]:
    """Recordatorios pendientes de los documentos propios: vencidos y los de los próximos `days` días."""
    today = dt.date.today()
    rows = db.execute(
        select(DocumentNote, Document.reference, Document.filename)
        .join(Document, DocumentNote.document_id == Document.id)
        .join(Farm, Document.farm_id == Farm.id)
        .where(
            Farm.owner_id == user.id,
            Document.is_draft.is_(False),
            DocumentNote.done.is_(False),
            DocumentNote.remind_on.is_not(None),
            DocumentNote.remind_on <= today + dt.timedelta(days=days),
        )
        .order_by(DocumentNote.remind_on, DocumentNote.id)
        .limit(100)
    ).all()
    return [
        DocumentReminder(**DocumentNoteResponse.model_validate(note).model_dump(), reference=ref, filename=name, overdue=note.remind_on < today)
        for note, ref, name in rows
    ]


@router.get("/{document_id}/notes", response_model=list[DocumentNoteResponse])
def list_notes(document_id: int, db: DbSession, user: FarmerUser) -> list[DocumentNote]:
    _owned_document(db, document_id, user)
    stmt = select(DocumentNote).where(DocumentNote.document_id == document_id)
    # Pendientes primero, por fecha de recordatorio; luego el resto, más recientes primero.
    return list(db.scalars(stmt.order_by(DocumentNote.done, DocumentNote.remind_on.is_(None), DocumentNote.remind_on, DocumentNote.created_at.desc())))


@router.post("/{document_id}/notes", response_model=DocumentNoteResponse, status_code=status.HTTP_201_CREATED)
def create_note(document_id: int, payload: DocumentNoteCreate, db: DbSession, user: FarmerUser) -> DocumentNote:
    _owned_document(db, document_id, user)
    count = db.scalar(select(func.count(DocumentNote.id)).where(DocumentNote.document_id == document_id)) or 0
    if count >= MAX_NOTES_PER_DOCUMENT:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Máximo {MAX_NOTES_PER_DOCUMENT} notas por documento.")
    now = utcnow()
    note = DocumentNote(document_id=document_id, author_id=user.id, body=payload.body, remind_on=payload.remind_on, created_at=now, updated_at=now)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{document_id}/notes/{note_id}", response_model=DocumentNoteResponse)
def update_note(document_id: int, note_id: int, payload: DocumentNoteUpdate, db: DbSession, user: FarmerUser) -> DocumentNote:
    note = _owned_note(db, document_id, note_id, user)
    changes = payload.model_dump(exclude_unset=True)
    for field in ("body", "done"):
        if field in changes and changes[field] is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"'{field}' cannot be null")
    for field, value in changes.items():
        setattr(note, field, value)
    note.updated_at = utcnow()
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{document_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(document_id: int, note_id: int, db: DbSession, user: FarmerUser) -> Response:
    db.delete(_owned_note(db, document_id, note_id, user))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
