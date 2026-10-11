from fastapi import APIRouter, Request
from sqlalchemy import select

import agent_service
from config import get_settings
from deps import DbSession, FarmerUser, client_ip
from document_ai import FarmRef
from models import Farm
from ratelimit import SlidingWindowLimiter
from schemas import AgentChatRequest, AgentChatResponse

router = APIRouter(prefix="/agent", tags=["agent"])

# Cada llamada tiene coste en la API de Gemini: límite por usuario.
_RATE_MESSAGE = "Demasiados mensajes seguidos. Espera un momento e inténtalo de nuevo."
_agent_by_user = SlidingWindowLimiter(get_settings().agent_rate_limit_per_minute, 60, _RATE_MESSAGE)
# Además por IP: varias cuentas desde la misma conexión no multiplican el gasto.
_agent_by_ip = SlidingWindowLimiter(get_settings().agent_rate_limit_per_ip_per_minute, 60, _RATE_MESSAGE)


@router.post("/chat", response_model=AgentChatResponse)
async def chat(payload: AgentChatRequest, request: Request, user: FarmerUser, db: DbSession) -> AgentChatResponse:
    """Envía un mensaje a Agropelink AI (solo agricultores y administradores).

    Si propone programar una labor o archivar un documento, devuelve `action` para confirmación humana.
    """
    # Comprobar ambos límites antes de registrar ninguno: un rechazo no consume cupo del otro.
    _agent_by_user.check(f"user:{user.id}")
    _agent_by_ip.check(f"ip:{client_ip(request)}")
    _agent_by_user.record(f"user:{user.id}")
    _agent_by_ip.record(f"ip:{client_ip(request)}")
    farms = [
        FarmRef(id=r.id, name=r.name, location=r.location)
        for r in db.execute(select(Farm.id, Farm.name, Farm.location).where(Farm.owner_id == user.id).order_by(Farm.id)).all()
    ]
    reply, action = await agent_service.chat(payload.message, payload.history, farms)
    return AgentChatResponse(reply=reply, action=action)
