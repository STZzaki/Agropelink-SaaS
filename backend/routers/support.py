"""Soporte: ticket rápido de asistencia técnica o legal desde cualquier panel."""

from fastapi import APIRouter, BackgroundTasks, status

from deps import CurrentUser, DbSession
from models import SupportTicket
from notifications import send_admin_notification
from ratelimit import SlidingWindowLimiter
from schemas import SupportTicketCreate, SupportTicketResponse
from security import utcnow

router = APIRouter(prefix="/support", tags=["support"])

_tickets_by_user = SlidingWindowLimiter(5, 60 * 60, "Has abierto demasiados tickets. Escríbenos a info@agropelink.es.")


@router.post("/tickets", response_model=SupportTicketResponse, status_code=status.HTTP_201_CREATED)
def open_ticket(payload: SupportTicketCreate, user: CurrentUser, db: DbSession, background: BackgroundTasks) -> SupportTicket:
    _tickets_by_user.hit(f"user:{user.id}")
    ticket = SupportTicket(user_id=user.id, **payload.model_dump(), created_at=utcnow())
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    background.add_task(
        send_admin_notification,
        subject=f"Ticket de soporte #{ticket.id} ({ticket.category.value}): {ticket.subject}",
        body=f"Usuario: #{user.id} {user.name} <{user.email}> · rol {user.role.value}\n\n{ticket.message}",
    )
    return ticket
