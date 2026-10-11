"""Integración con Gemini para Agropelink AI.

La clave de la API se lee solo en el servidor (tech_rules.md §2.1). La salida del modelo
se trata como no confiable: la acción propuesta se valida con Pydantic y nunca se ejecuta
aquí; el frontend la muestra para aprobación humana y la crea vía `POST /api/v1/tasks`.
"""

import json
import logging
import re
from functools import lru_cache

from fastapi import HTTPException, status
from google import genai
from google.genai import types
from pydantic import ValidationError

from config import get_settings
from document_ai import FarmRef, _farms_block, coerce_proposal
from models import DocumentType
from schemas import AgentHistoryItem, CreateTaskAction, FileDocumentAction

logger = logging.getLogger("agropelink.agent")

SYSTEM_INSTRUCTION = """\
Eres Agropelink AI, asistente agronómico para gestión de parcelas, tareas agrícolas y dudas de campo. \
Responde de forma concisa y profesional en español.

Si el usuario te pide programar una labor agrícola, responde con el texto explicativo y al final incluye \
un bloque JSON estructurado, delimitado con ```json, con este formato exacto (JSON válido, comillas dobles):
```json
{"action": "create_task", "title": "...", "description": "..."}
```
- "title": breve (máximo 200 caracteres). "description": detalles útiles de la labor (máximo 2000 caracteres).
- Incluye el bloque solo cuando se pida programar o crear una labor; nunca en otros casos.
- No afirmes que la tarea ya está creada: el usuario debe confirmarla primero.

Si el usuario te pide guardar o archivar un documento (factura, albarán, análisis, certificado, contrato…), \
extrae sus metadatos y al final incluye un bloque ```json con este formato:
```json
{"action": "file_document", "doc_type": "...", "fiscal_year": 2026, "campaign": "Tomate 2026", \
"accrual_date": "AAAA-MM-DD", "amount": 450.0, "vendor": "...", "status": "pending", "farm_id": 1, "summary": "..."}
```
- "doc_type" es uno de: {doc_types}.
- Usa null en lo que no se indique; "farm_id" solo puede ser un id de la lista de fincas del usuario.
- Recuerda al usuario que adjunte el archivo (clip del chat) y que revise los datos antes de guardarlo: \
nada se archiva sin su confirmación.

Fincas del usuario:
{farms}
"""

_FALLBACK_REPLY = "No he podido generar una respuesta. ¿Puedes reformular la pregunta?"

# Bloques ```json ... ``` (o ``` ... ```) que contengan un objeto.
_FENCED_JSON = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL | re.IGNORECASE)
# Respaldo: objeto JSON suelto al final de la respuesta que declare una acción.
_TRAILING_JSON = re.compile(r"(\{[^{}]*[\"']action[\"'][^{}]*\})\s*$", re.DOTALL)


def _redact(text: str) -> str:
    """Elimina la API key (y patrones de clave de Google) de un texto antes de registrarlo."""
    key = get_settings().gemini_api_key
    if key is not None and key.get_secret_value():
        text = text.replace(key.get_secret_value(), "[REDACTED]")
    return re.sub(r"AIza[0-9A-Za-z_\-]{20,}", "[REDACTED]", text)[:500]


@lru_cache
def _get_client() -> genai.Client:
    settings = get_settings()
    if settings.gemini_api_key is None or not settings.gemini_api_key.get_secret_value():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Agent not configured")
    return genai.Client(
        api_key=settings.gemini_api_key.get_secret_value(),
        http_options=types.HttpOptions(
            timeout=settings.gemini_timeout_seconds * 1000,
            # Reintentos con backoff ante saturación puntual del servicio (429/5xx).
            retry_options=types.HttpRetryOptions(attempts=3, http_status_codes=[429, 500, 503, 504]),
        ),
    )


AgentAction = CreateTaskAction | FileDocumentAction


def extract_action(text: str, farms: list[FarmRef] | None = None) -> tuple[str, AgentAction | None]:
    """Separa el texto explicativo del bloque JSON de acción y valida la acción."""
    match = None
    for candidate in (*_FENCED_JSON.finditer(text), *_TRAILING_JSON.finditer(text)):
        match = candidate  # nos quedamos con el último bloque
    if match is None:
        return text.strip(), None

    clean_text = (text[: match.start()] + text[match.end() :]).strip()
    try:
        data = json.loads(match.group(1))
        if isinstance(data, dict) and data.get("action") == "file_document":
            proposal = coerce_proposal(data, farms or [])
            return clean_text, FileDocumentAction(proposal=proposal) if proposal else None
        if not isinstance(data, dict) or data.get("action") != "create_task":
            return clean_text, None
        action = CreateTaskAction(
            title=str(data.get("title", ""))[:200],
            description=(str(data["description"])[:5000] if data.get("description") else None),
        )
    except (json.JSONDecodeError, ValidationError):
        logger.warning("El modelo devolvió un bloque de acción no válido; se ignora")
        return clean_text, None
    return clean_text, action


async def chat(message: str, history: list[AgentHistoryItem], farms: list[FarmRef] | None = None) -> tuple[str, AgentAction | None]:
    settings = get_settings()
    client = _get_client()

    contents = [
        types.Content(role=item.role, parts=[types.Part.from_text(text=item.text)]) for item in history
    ]
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=message)]))

    try:
        response = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION.replace("{doc_types}", ", ".join(t.value for t in DocumentType)).replace(
                    "{farms}", _farms_block(farms or [])
                ),
                temperature=0.4,
                max_output_tokens=2048,
            ),
        )
    except Exception as exc:
        # Al cliente: mensaje genérico. Al log: tipo y mensaje con cualquier secreto redactado
        # (sin traza completa, que podría arrastrar cabeceras o parámetros de la petición al SDK).
        logger.error("Fallo al llamar a Gemini (modelo %s): %s: %s", settings.gemini_model, type(exc).__name__, _redact(str(exc)))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="El asistente no está disponible ahora mismo."
        ) from None

    text = response.text or ""
    if not text.strip():
        return _FALLBACK_REPLY, None
    reply, action = extract_action(text, farms)
    if not reply:
        reply = "He preparado una propuesta. Revísala antes de confirmarla." if action else _FALLBACK_REPLY
    return reply, action
