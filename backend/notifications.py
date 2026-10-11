"""Envío de notificaciones por correo (SMTP con STARTTLS)."""

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from config import get_settings

logger = logging.getLogger("agropelink.notifications")


def _one_line(text: str, limit: int = 120) -> str:
    """Las cabeceras no admiten saltos de línea (evita inyección de cabeceras)."""
    return " ".join(text.split())[:limit]


def send_contact_notification(*, name: str, email: str, phone: str, message: str, message_id: int) -> None:
    """Avisa al buzón oficial de un nuevo contacto. Pensado para ejecutarse como tarea en segundo plano."""
    settings = get_settings()
    if not settings.smtp_host:
        logger.warning("SMTP no configurado: contacto #%s guardado sin notificación por correo", message_id)
        return

    msg = EmailMessage()
    msg["Subject"] = f"[Agropelink] Nuevo contacto web #{message_id}: {_one_line(name, 60)}"
    msg["From"] = formataddr(("Agropelink Web", settings.smtp_from))
    msg["To"] = settings.contact_notify_to
    # Responder desde el cliente de correo contesta directamente al interesado (email ya validado).
    msg["Reply-To"] = formataddr((_one_line(name, 60), email))
    msg["Message-ID"] = make_msgid(domain=settings.smtp_from.split("@")[-1])
    # Solo texto plano: el contenido del usuario nunca se interpreta como HTML.
    msg.set_content(
        "Nuevo mensaje desde el formulario de contacto de agropelink.es\n\n"
        f"Nombre:   {name}\n"
        f"Email:    {email}\n"
        f"Teléfono: {phone}\n"
        f"ID:       {message_id}\n\n"
        "Mensaje:\n"
        f"{message}\n\n"
        "— El remitente aceptó la política de privacidad.\n"
    )

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            if settings.smtp_starttls:
                smtp.starttls(context=ssl.create_default_context())
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password.get_secret_value())
            smtp.send_message(msg)
        logger.info("Notificación de contacto #%s enviada a %s", message_id, settings.contact_notify_to)
    except (smtplib.SMTPException, OSError):
        # El mensaje ya está guardado en BD: un fallo de correo no se propaga al usuario.
        logger.exception("No se pudo enviar la notificación del contacto #%s", message_id)


def send_admin_notification(*, subject: str, body: str) -> None:
    """Aviso genérico al buzón oficial (denuncias del foro, solicitudes de alta, tickets de soporte).

    Pensado para ejecutarse como tarea en segundo plano. Solo texto plano: el contenido de usuario
    nunca se interpreta como HTML, y el asunto se reduce a una línea (sin inyección de cabeceras).
    """
    settings = get_settings()
    if not settings.smtp_host:
        logger.warning("SMTP no configurado: aviso '%s' disponible solo en el panel de administración", _one_line(subject, 80))
        return

    msg = EmailMessage()
    msg["Subject"] = f"[Agropelink] {_one_line(subject)}"
    msg["From"] = formataddr(("Agropelink Plataforma", settings.smtp_from))
    msg["To"] = settings.contact_notify_to
    msg["Message-ID"] = make_msgid(domain=settings.smtp_from.split("@")[-1])
    msg.set_content(body + "\n\n— Gestiona este aviso desde el panel de administración (/admin).\n")

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            if settings.smtp_starttls:
                smtp.starttls(context=ssl.create_default_context())
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password.get_secret_value())
            smtp.send_message(msg)
    except (smtplib.SMTPException, OSError):
        logger.exception("No se pudo enviar el aviso de administración '%s'", _one_line(subject, 80))
