from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from deps import DbSession, FarmerUser, get_owned_farm
from models import Farm, Task, TaskStatus, User
from schemas import TaskCreate, TaskResponse, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _get_owned_task(db: Session, task_id: int, user: User) -> Task:
    stmt = (
        select(Task)
        .join(Task.farm)
        .where(Task.id == task_id, Farm.owner_id == user.id)
    )
    task = db.scalar(stmt)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


@router.get("", response_model=list[TaskResponse])
def list_tasks(
    db: DbSession,
    user: FarmerUser,
    farm_id: Annotated[int | None, Query(gt=0)] = None,
    task_status: Annotated[TaskStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Task]:
    """Lista las tareas de las granjas del usuario, con filtros opcionales por `farm_id` y `status`."""
    stmt = select(Task).join(Task.farm).where(Farm.owner_id == user.id)
    if farm_id is not None:
        stmt = stmt.where(Task.farm_id == farm_id)
    if task_status is not None:
        stmt = stmt.where(Task.status == task_status)
    stmt = stmt.order_by(Task.date, Task.id).limit(limit).offset(offset)
    return list(db.scalars(stmt))


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, db: DbSession, user: FarmerUser) -> Task:
    """Crea una tarea asociada a una granja del usuario."""
    get_owned_farm(db, payload.farm_id, user)
    task = Task(**payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.put("/{task_id}", response_model=TaskResponse)
def update_task(task_id: int, payload: TaskUpdate, db: DbSession, user: FarmerUser) -> Task:
    """Actualiza el estado o los detalles de una tarea. Solo se modifican los campos enviados."""
    task = _get_owned_task(db, task_id, user)
    changes = payload.model_dump(exclude_unset=True)
    for field in ("title", "date", "status"):
        if field in changes and changes[field] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"'{field}' cannot be null",
            )
    for field, value in changes.items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: DbSession, user: FarmerUser) -> Response:
    """Elimina una tarea."""
    task = _get_owned_task(db, task_id, user)
    db.delete(task)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
