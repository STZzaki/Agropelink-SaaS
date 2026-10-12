"""Vista del trabajador (cualquier rol): vincularse a un agricultor con un código y ver/actualizar SUS tareas.

El trabajador solo ve las tareas que tiene asignadas en fichas de trabajador activas vinculadas a su cuenta:
nunca costes, sueldos ni otras tareas de la finca. Solo puede cambiar el estado de la tarea.
"""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from deps import CurrentUser, DbSession, client_ip
from models import Farm, Task, User, Worker
from ratelimit import SlidingWindowLimiter
from routers.tasks import attachment_response
from routers.workers import normalize_code
from schemas import AssignedStatusUpdate, AssignedTaskResponse, WorkerLinkRequest, WorkerLinkResponse
from security import hash_token, utcnow

router = APIRouter(prefix="/me", tags=["assigned"])

# Fuerza bruta de códigos: 10 intentos por cuenta y por IP cada 15 minutos.
_link_limiter = SlidingWindowLimiter(10, 15 * 60, "Demasiados intentos. Espera unos minutos y vuelve a probar.")


def _assigned_tasks_stmt(user: User):  # type: ignore[no-untyped-def]
    return (
        select(Task, Farm.name, User.name)
        .join(Worker, Task.worker_id == Worker.id)
        .join(Farm, Task.farm_id == Farm.id)
        .join(User, Worker.owner_id == User.id)
        .where(Worker.user_id == user.id, Worker.active.is_(True))
    )


_TASK_FIELDS = ("id", "title", "description", "date", "end_date", "status", "category", "farm_id", "worker_id", "attachments")


def _to_assigned(task: Task, farm_name: str, employer: str) -> AssignedTaskResponse:
    fields = {name: getattr(task, name) for name in _TASK_FIELDS}
    return AssignedTaskResponse.model_validate({**fields, "farm_name": farm_name, "employer_name": employer})


def _assigned_task(db: Session, task_id: int, user: User) -> tuple[Task, str, str]:
    row = db.execute(_assigned_tasks_stmt(user).where(Task.id == task_id)).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return row[0], row[1], row[2]


@router.post("/worker-links", response_model=WorkerLinkResponse, status_code=status.HTTP_201_CREATED)
def redeem_code(payload: WorkerLinkRequest, request: Request, db: DbSession, user: CurrentUser) -> WorkerLinkResponse:
    keys = (f"user:{user.id}", f"ip:{client_ip(request)}")
    _link_limiter.hit(*keys)
    worker = db.scalar(select(Worker).where(Worker.invite_hash == hash_token(normalize_code(payload.code))))
    # Mismo mensaje para código inexistente, caducado o ya usado: no se filtra información.
    invalid = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Código no válido o caducado.")
    if worker is None or not worker.active or worker.user_id is not None or (worker.invite_expires_at or utcnow()) <= utcnow():
        raise invalid
    if worker.owner_id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No puedes vincularte a tu propia ficha de trabajador.")
    if db.scalar(select(Worker.id).where(Worker.owner_id == worker.owner_id, Worker.user_id == user.id)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya estás vinculado a este agricultor.")
    worker.user_id = user.id
    worker.invite_hash = None
    worker.invite_expires_at = None
    db.commit()
    employer = db.get(User, worker.owner_id)
    return WorkerLinkResponse(worker_id=worker.id, employer_name=employer.name if employer else "")


@router.get("/worker-links", response_model=list[WorkerLinkResponse])
def my_links(db: DbSession, user: CurrentUser) -> list[WorkerLinkResponse]:
    rows = db.execute(
        select(Worker.id, User.name).join(User, Worker.owner_id == User.id).where(Worker.user_id == user.id, Worker.active.is_(True))
    ).all()
    return [WorkerLinkResponse(worker_id=wid, employer_name=name) for wid, name in rows]


@router.delete("/worker-links/{worker_id}", status_code=status.HTTP_204_NO_CONTENT)
def leave(worker_id: int, db: DbSession, user: CurrentUser) -> Response:
    """El trabajador puede desvincularse cuando quiera."""
    worker = db.scalar(select(Worker).where(Worker.id == worker_id, Worker.user_id == user.id))
    if worker is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    worker.user_id = None
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tasks", response_model=list[AssignedTaskResponse])
def my_tasks(
    db: DbSession,
    user: CurrentUser,
    start: Annotated[dt.date | None, Query(alias="from")] = None,
    end: Annotated[dt.date | None, Query(alias="to")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[AssignedTaskResponse]:
    stmt = _assigned_tasks_stmt(user)
    if end is not None:
        stmt = stmt.where(Task.date <= end)
    if start is not None:
        stmt = stmt.where(func.coalesce(Task.end_date, Task.date) >= start)
    rows = db.execute(stmt.order_by(Task.date, Task.id).limit(limit)).all()
    return [_to_assigned(task, farm, employer) for task, farm, employer in rows]


@router.put("/tasks/{task_id}/status", response_model=AssignedTaskResponse)
def update_my_task_status(task_id: int, payload: AssignedStatusUpdate, db: DbSession, user: CurrentUser) -> AssignedTaskResponse:
    task, farm, employer = _assigned_task(db, task_id, user)
    task.status = payload.status
    db.commit()
    db.refresh(task)
    return _to_assigned(task, farm, employer)


@router.get("/tasks/{task_id}/attachments/{attachment_id}")
def my_task_attachment(task_id: int, attachment_id: int, db: DbSession, user: CurrentUser) -> Response:
    task, _, _ = _assigned_task(db, task_id, user)
    attachment = next((a for a in task.attachments if a.id == attachment_id), None)
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    return attachment_response(attachment)
