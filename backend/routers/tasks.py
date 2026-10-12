"""Tareas de las fincas: calendario (rango de fechas), gastos directos, trabajador asignado y adjuntos privados."""

import datetime as dt
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic_core import PydanticCustomError
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

import forum_media
import storage
from config import get_settings
from deps import DbSession, FarmerUser, get_owned_farm
from models import Expense, Farm, Task, TaskAttachment, TaskStatus, User, Worker
from schemas import TaskCreate, TaskResponse, TaskUpdate, _check_span

router = APIRouter(prefix="/tasks", tags=["tasks"])

MAX_ATTACHMENTS = 10


def task_media_dir() -> Path:
    path = Path(get_settings().task_media_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _get_owned_task(db: Session, task_id: int, user: User) -> Task:
    stmt = select(Task).join(Task.farm).where(Task.id == task_id, Farm.owner_id == user.id)
    task = db.scalar(stmt)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


def _check_worker(db: Session, worker_id: int | None, user: User) -> None:
    """IDOR: solo se puede asignar un trabajador propio y activo."""
    if worker_id is None:
        return
    if db.scalar(select(Worker.id).where(Worker.id == worker_id, Worker.owner_id == user.id, Worker.active.is_(True))) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker not found")


def _direct_costs(db: Session, task_ids: list[int]) -> dict[int, float]:
    if not task_ids:
        return {}
    rows = db.execute(select(Expense.task_id, func.sum(Expense.amount)).where(Expense.task_id.in_(task_ids)).group_by(Expense.task_id))
    return {tid: float(total or 0) for tid, total in rows}


def to_response(task: Task, cost: float = 0.0) -> TaskResponse:
    response = TaskResponse.model_validate(task)
    response.direct_cost = round(cost, 2)
    return response


@router.get("", response_model=list[TaskResponse])
def list_tasks(
    db: DbSession,
    user: FarmerUser,
    farm_id: Annotated[int | None, Query(gt=0)] = None,
    task_status: Annotated[TaskStatus | None, Query(alias="status")] = None,
    worker_id: Annotated[int | None, Query(gt=0)] = None,
    start: Annotated[dt.date | None, Query(alias="from", description="Tareas que se solapan con [from, to]")] = None,
    end: Annotated[dt.date | None, Query(alias="to")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[TaskResponse]:
    """Tareas de las granjas del usuario. Con `from`/`to` devuelve las que se solapan con ese rango (calendario)."""
    stmt = select(Task).join(Task.farm).where(Farm.owner_id == user.id)
    if farm_id is not None:
        stmt = stmt.where(Task.farm_id == farm_id)
    if task_status is not None:
        stmt = stmt.where(Task.status == task_status)
    if worker_id is not None:
        stmt = stmt.where(Task.worker_id == worker_id)
    if end is not None:
        stmt = stmt.where(Task.date <= end)
    if start is not None:
        stmt = stmt.where(func.coalesce(Task.end_date, Task.date) >= start)
    tasks = list(db.scalars(stmt.order_by(Task.date, Task.id).limit(limit).offset(offset)))
    costs = _direct_costs(db, [t.id for t in tasks])
    return [to_response(t, costs.get(t.id, 0.0)) for t in tasks]


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, db: DbSession, user: FarmerUser) -> TaskResponse:
    """Crea la tarea y, en la MISMA transacción, sus gastos directos (costes variables de la finca)."""
    get_owned_farm(db, payload.farm_id, user)
    _check_worker(db, payload.worker_id, user)
    task = Task(**payload.model_dump(exclude={"costs"}))
    db.add(task)
    db.flush()
    for cost in payload.costs:
        db.add(Expense(**cost.model_dump(), farm_id=task.farm_id, task_id=task.id, incurred_on=task.date, is_fixed=False))
    db.commit()
    db.refresh(task)
    return to_response(task, float(sum(c.amount for c in payload.costs)))


@router.put("/{task_id}", response_model=TaskResponse)
def update_task(task_id: int, payload: TaskUpdate, db: DbSession, user: FarmerUser) -> TaskResponse:
    """Actualiza el estado o los detalles de una tarea. Solo se modifican los campos enviados."""
    task = _get_owned_task(db, task_id, user)
    changes = payload.model_dump(exclude_unset=True)
    for field in ("title", "date", "status", "category"):
        if field in changes and changes[field] is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"'{field}' cannot be null")
    if "worker_id" in changes:
        _check_worker(db, changes["worker_id"], user)
    # El rango se valida con el resultado final (p. ej. mover solo el inicio después del fin).
    try:
        _check_span(changes.get("date", task.date), changes.get("end_date", task.end_date))
    except PydanticCustomError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=exc.message()) from exc
    for field, value in changes.items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return to_response(task, _direct_costs(db, [task.id]).get(task.id, 0.0))


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: DbSession, user: FarmerUser) -> Response:
    """Elimina la tarea y sus adjuntos. Sus gastos directos se conservan en Economía (el dinero se gastó)."""
    task = _get_owned_task(db, task_id, user)
    attachments = list(task.attachments)
    db.execute(update(Expense).where(Expense.task_id == task.id).values(task_id=None))
    db.delete(task)
    db.commit()
    for attachment in attachments:
        delete_attachment_file(attachment)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Adjuntos --------------------------------------------------------------------------------------------


def delete_attachment_file(attachment: TaskAttachment) -> None:
    if attachment.kind == "pdf":
        storage.delete_stored(attachment.storage_key)
    else:
        forum_media.delete_media(attachment.storage_key, task_media_dir())


@router.post("/{task_id}/attachments", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    task_id: int,
    db: DbSession,
    user: FarmerUser,
    file: Annotated[UploadFile, File(description="Foto PNG/JPEG/WEBP (máx. 5 MB) o PDF (máx. 10 MB).")],
) -> TaskResponse:
    """Fotos: recodificadas y sin metadatos (EXIF/GPS). PDF: magic bytes, nombre seguro y sin contenido activo."""
    task = _get_owned_task(db, task_id, user)
    if len(task.attachments) >= MAX_ATTACHMENTS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Máximo {MAX_ATTACHMENTS} adjuntos por tarea.")
    header = await file.read(8)
    await file.seek(0)
    name = storage.sanitize_filename(file.filename)
    if header.startswith(b"%PDF-"):
        stored = await storage.save_upload(file)
        attachment = TaskAttachment(kind="pdf", storage_key=stored.storage_key, content_type=stored.content_type, size_bytes=stored.size_bytes)
    else:
        media = await forum_media.save_forum_upload(file, folder=task_media_dir(), allow_video=False)
        attachment = TaskAttachment(kind="image", storage_key=media.storage_key, content_type=media.content_type, size_bytes=media.size_bytes)
    attachment.task_id = task.id
    attachment.original_name = name[:255]
    attachment.uploaded_by = user.id
    db.add(attachment)
    try:
        db.commit()
    except Exception:
        db.rollback()
        delete_attachment_file(attachment)
        raise
    db.refresh(task)
    return to_response(task, _direct_costs(db, [task.id]).get(task.id, 0.0))


def attachment_response(attachment: TaskAttachment) -> Response:
    """Descarga privada: cabeceras que impiden ejecutar o reinterpretar el contenido en el navegador."""
    headers = {"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, no-store"}
    if attachment.kind == "pdf":
        headers["Content-Disposition"] = 'attachment; filename="adjunto.pdf"'
        return StreamingResponse(storage.iter_stored(attachment.storage_key), media_type="application/pdf", headers=headers)
    path = forum_media.media_path(attachment.storage_key, task_media_dir())
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return FileResponse(path, media_type=attachment.content_type, headers=headers)


def _owned_attachment(db: Session, task_id: int, attachment_id: int, user: User) -> TaskAttachment:
    task = _get_owned_task(db, task_id, user)
    attachment = next((a for a in task.attachments if a.id == attachment_id), None)
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    return attachment


@router.get("/{task_id}/attachments/{attachment_id}")
def download_attachment(task_id: int, attachment_id: int, db: DbSession, user: FarmerUser) -> Response:
    return attachment_response(_owned_attachment(db, task_id, attachment_id, user))


@router.delete("/{task_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(task_id: int, attachment_id: int, db: DbSession, user: FarmerUser) -> Response:
    attachment = _owned_attachment(db, task_id, attachment_id, user)
    db.delete(attachment)
    db.commit()
    delete_attachment_file(attachment)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

