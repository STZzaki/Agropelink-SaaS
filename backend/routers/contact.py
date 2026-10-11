import logging

from fastapi import APIRouter, BackgroundTasks, Request, status

from deps import DbSession, client_ip
from models import ContactMessage
from notifications import send_contact_notification
from ratelimit import SlidingWindowLimiter
from schemas import ContactCreate, ContactResponse

router = APIRouter(prefix="/contact", tags=["contact"])
logger = logging.getLogger("agropelink.contact")

# Endpoint público: límite por IP.
_contact_by_ip = SlidingWindowLimiter(5, 10 * 60, "Has enviado demasiados mensajes. Inténtalo de nuevo más tarde.")


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
def submit_contact(payload: ContactCreate, request: Request, db: DbSession, background: BackgroundTasks) -> ContactResponse:
    """Recibe el formulario de contacto (público) y notifica al buzón oficial `CONTACT_NOTIFY_TO`."""
    _contact_by_ip.hit(client_ip(request))

    if payload.website:
        # Probable bot: se responde igual que un envío válido, pero no se guarda.
        logger.info("Envío de contacto descartado por honeypot")
        return ContactResponse()

    contact = ContactMessage(**payload.model_dump(exclude={"privacy_accepted", "website"}))
    db.add(contact)
    db.commit()
    # El correo se envía tras responder: el usuario no espera al servidor SMTP.
    background.add_task(
        send_contact_notification,
        name=contact.name,
        email=contact.email,
        phone=contact.phone,
        message=contact.message,
        message_id=contact.id,
    )
    return ContactResponse()
