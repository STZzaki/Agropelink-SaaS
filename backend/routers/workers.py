"""Trabajadores del agricultor: puesto, coste, horario y vinculación (con consentimiento) a una cuenta «Usuario».

Vinculación: el agricultor genera un código de un solo uso (caduca en 7 días; solo se guarda su hash) y se lo da
al trabajador, que lo introduce en su portal. Así nunca se busca a nadie por email (no se revela si una cuenta
existe) y el trabajador decide si acepta. Puede desvincularse cualquiera de los dos en cualquier momento.
"""

import base64
import datetime as dt
import secrets

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import func, select, update

from deps import DbSession, FarmerUser
from models import Task, TaskStatus, Worker
from schemas import WorkerIn, WorkerInvite, WorkerResponse
from security import hash_token, utcnow

router = APIRouter(prefix="/workers", tags=["workers"])

MAX_WORKERS = 500
INVITE_TTL = dt.timedelta(days=7)


def normalize_code(code: str) -> str:
    """El código se muestra como XXXXX-XXXXX; se acepta con o sin guion y en minúsculas."""
    return "".join(ch for ch in code.upper() if ch.isalnum())


def _new_code() -> str:
    # 50 bits de entropía (10 caracteres base32) + límite de intentos al canjearlo.
    raw = base64.b32encode(secrets.token_bytes(10)).decode()[:10]
    return f"{raw[:5]}-{raw[5:]}"


def _owned_worker(db: DbSession, worker_id: int, user: FarmerUser) -> Worker:
    worker = db.scalar(select(Worker).where(Worker.id == worker_id, Worker.owner_id == user.id))
    if worker is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker not found")
    return worker


def _to_response(worker: Worker, open_tasks: int = 0) -> WorkerResponse:
    response = WorkerResponse.model_validate(worker)
    response.linked = worker.user_id is not None
    # Solo el nombre de la cuenta vinculada (el trabajador ya lo aceptó al canjear el código); nunca su email.
    response.linked_account_name = worker.user.name if worker.user else None
    response.invite_pending = worker.invite_hash is not None and (worker.invite_expires_at or utcnow()) > utcnow()
    response.open_tasks = open_tasks
    return response


@router.get("", response_model=list[WorkerResponse])
def list_workers(db: DbSession, user: FarmerUser) -> list[WorkerResponse]:
    workers = list(db.scalars(select(Worker).where(Worker.owner_id == user.id).order_by(Worker.active.desc(), Worker.name)))
    counts = dict(
        db.execute(
            select(Task.worker_id, func.count(Task.id))
            .where(Task.worker_id.in_([w.id for w in workers]), Task.status != TaskStatus.DONE)
            .group_by(Task.worker_id)
        ).all()
    ) if workers else {}
    return [_to_response(w, counts.get(w.id, 0)) for w in workers]


@router.post("", response_model=WorkerResponse, status_code=status.HTTP_201_CREATED)
def create_worker(payload: WorkerIn, db: DbSession, user: FarmerUser) -> WorkerResponse:
    if (db.scalar(select(func.count(Worker.id)).where(Worker.owner_id == user.id)) or 0) >= MAX_WORKERS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Máximo {MAX_WORKERS} trabajadores.")
    worker = Worker(owner_id=user.id, **payload.model_dump())
    db.add(worker)
    db.commit()
    db.refresh(worker)
    return _to_response(worker)


@router.put("/{worker_id}", response_model=WorkerResponse)
def update_worker(worker_id: int, payload: WorkerIn, db: DbSession, user: FarmerUser) -> WorkerResponse:
    worker = _owned_worker(db, worker_id, user)
    for field, value in payload.model_dump().items():
        setattr(worker, field, value)
    db.commit()
    db.refresh(worker)
    return _to_response(worker)


@router.delete("/{worker_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_worker(worker_id: int, db: DbSession, user: FarmerUser) -> Response:
    """Las tareas que tenía asignadas quedan sin asignar (no se borran)."""
    worker = _owned_worker(db, worker_id, user)
    db.execute(update(Task).where(Task.worker_id == worker.id).values(worker_id=None))
    db.delete(worker)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{worker_id}/invite", response_model=WorkerInvite)
def create_invite(worker_id: int, db: DbSession, user: FarmerUser) -> WorkerInvite:
    """Genera (o regenera, invalidando el anterior) el código de vinculación. Se muestra UNA sola vez."""
    worker = _owned_worker(db, worker_id, user)
    if worker.user_id is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El trabajador ya tiene una cuenta vinculada.")
    if not worker.active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Activa al trabajador antes de invitarlo.")
    code = _new_code()
    worker.invite_hash = hash_token(normalize_code(code))
    worker.invite_expires_at = utcnow() + INVITE_TTL
    db.commit()
    return WorkerInvite(code=code, expires_at=worker.invite_expires_at.replace(tzinfo=dt.UTC))


@router.delete("/{worker_id}/link", status_code=status.HTTP_204_NO_CONTENT)
def unlink_worker(worker_id: int, db: DbSession, user: FarmerUser) -> Response:
    worker = _owned_worker(db, worker_id, user)
    worker.user_id = None
    worker.invite_hash = None
    worker.invite_expires_at = None
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
