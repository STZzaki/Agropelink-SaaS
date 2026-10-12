from fastapi import APIRouter, Request

import agent_service
import agent_tools
from config import get_settings
from deps import DbSession, FarmerUser, client_ip
from ratelimit import SlidingWindowLimiter
from schemas import AgentBriefing, AgentChatRequest, AgentChatResponse, BriefingItem
from security import utcnow

router = APIRouter(prefix="/agent", tags=["agent"])

# Límite por usuario y por IP (con un modelo externo, cada llamada tiene coste; en local protege el servidor).
_RATE_MESSAGE = "Demasiados mensajes seguidos. Espera un momento e inténtalo de nuevo."
_agent_by_user = SlidingWindowLimiter(get_settings().agent_rate_limit_per_minute, 60, _RATE_MESSAGE)
_agent_by_ip = SlidingWindowLimiter(get_settings().agent_rate_limit_per_ip_per_minute, 60, _RATE_MESSAGE)


@router.post("/chat", response_model=AgentChatResponse)
async def chat(payload: AgentChatRequest, request: Request, user: FarmerUser, db: DbSession) -> AgentChatResponse:
    """Agropelink AI (agricultores y administradores) con los datos de SUS fincas.

    Si propone programar una labor, apuntar un gasto o archivar un documento, devuelve `action` para que el
    usuario la confirme: el agente nunca escribe nada por su cuenta.
    """
    # Comprobar ambos límites antes de registrar ninguno: un rechazo no consume cupo del otro.
    _agent_by_user.check(f"user:{user.id}")
    _agent_by_ip.check(f"ip:{client_ip(request)}")
    _agent_by_user.record(f"user:{user.id}")
    _agent_by_ip.record(f"ip:{client_ip(request)}")
    ctx = agent_tools.build_context(db, user)
    reply, action, engine = await agent_service.respond(ctx, payload.message, payload.history)
    return AgentChatResponse(reply=reply, action=action, engine=engine)


@router.get("/briefing", response_model=AgentBriefing)
def briefing(user: FarmerUser, db: DbSession) -> AgentBriefing:
    """Resumen del día (alertas de sensores, tareas, recordatorios y presupuesto). Siempre local: sin coste ni terceros."""
    ctx = agent_tools.build_context(db, user)
    return AgentBriefing(generated_at=utcnow(), engine="local", items=[BriefingItem(**i) for i in agent_tools.briefing(ctx)])
