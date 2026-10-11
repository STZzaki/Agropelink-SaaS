import logging
import re
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

import models  # noqa: F401  (registra los modelos en Base.metadata)
from config import get_settings
from database import SessionLocal, engine
from deps import BANNED_DETAIL
from models import User, UserSession
from security import hash_token, utcnow
from db_migrations import sync_schema
from routers import api_router, market

settings = get_settings()
logger = logging.getLogger("agropelink")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Provisional hasta introducir migraciones con Alembic: crea tablas y añade columnas nuevas.
    sync_schema(engine)
    await market.warm_up()
    yield


app = FastAPI(
    title="Agropelink API",
    version="1.0.0",
    lifespan=lifespan,
    debug=False,
    # Documentación interactiva solo en desarrollo.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)

_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Rutas de subida (multipart/form-data) y su límite de cuerpo. Expresiones ancladas a la ruta completa:
# cubren rutas con parámetros (`/farms/{id}/photo`) sin abrir el límite grande a ninguna otra.
_UPLOAD_LIMITS: list[tuple[re.Pattern[str], int]] = [
    (re.compile(r"/api/v1/documents/(?:upload|analyze)"), settings.max_upload_bytes),
    (re.compile(r"/api/v1/forum/upload"), max(settings.forum_image_max_bytes, settings.forum_video_max_bytes)),
    (re.compile(r"/api/v1/farms/\d{1,12}/photo"), settings.forum_image_max_bytes),
]
_MULTIPART_OVERHEAD = 1024 * 1024  # cabeceras multipart y campos del formulario


def _upload_limit(scope) -> int | None:  # type: ignore[no-untyped-def]
    """Límite si la ruta es de subida Y el cuerpo es multipart: un JSON nunca hereda el límite grande."""
    content_type = dict(scope["headers"]).get(b"content-type", b"")
    if not content_type.lower().startswith(b"multipart/form-data"):
        return None
    return next((limit for pattern, limit in _UPLOAD_LIMITS if pattern.fullmatch(scope["path"])), None)


class BodySizeLimitMiddleware:
    """Rechaza cuerpos excesivos ANTES de que la app los lea o parsee (evita agotar memoria).

    - Con `Content-Length` (lo envían siempre los navegadores): se compara con el límite sin leer nada;
      el servidor HTTP ya garantiza que el cuerpo no supera lo declarado.
    - Sin `Content-Length` (transfer-encoding: chunked): en JSON se lee aquí hasta el límite (64 KB) y,
      si se supera, se responde 413 sin llegar a la app; en subidas se exige la longitud (411).
    """

    def __init__(self, app):  # type: ignore[no-untyped-def]
        self.app = app

    @staticmethod
    async def _reject(scope, receive, send, status: int, detail: str) -> None:  # type: ignore[no-untyped-def]
        await JSONResponse(status_code=status, content={"detail": detail})(scope, receive, send)

    async def __call__(self, scope, receive, send):  # type: ignore[no-untyped-def]
        if scope["type"] != "http" or scope["method"] not in _UNSAFE_METHODS:
            return await self.app(scope, receive, send)

        upload_limit = _upload_limit(scope)
        is_upload = upload_limit is not None
        limit = upload_limit + _MULTIPART_OVERHEAD if is_upload else settings.max_json_body_bytes
        declared = dict(scope["headers"]).get(b"content-length")

        if declared is not None:
            if not declared.isdigit() or int(declared) > limit:
                return await self._reject(scope, receive, send, 413, "Request body too large")
            return await self.app(scope, receive, send)

        if is_upload:
            return await self._reject(scope, receive, send, 411, "Content-Length required")

        # Cuerpo JSON sin longitud declarada: se acumula de forma acotada y se reenvía a la app.
        body, more = bytearray(), True
        while more:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body += message.get("body", b"")
            more = message.get("more_body", False)
            if len(body) > limit:
                return await self._reject(scope, receive, send, 413, "Request body too large")

        replayed = False

        async def replay():  # type: ignore[no-untyped-def]
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)


_BAN_EXEMPT = {"/api/v1/auth/logout", "/api/health"}


def _is_banned_session(token: str) -> bool:
    """¿La cookie pertenece a una sesión vigente de una cuenta bloqueada? (consulta ORM parametrizada)."""
    with SessionLocal() as db:
        return bool(
            db.scalar(
                select(User.is_banned)
                .join(UserSession, UserSession.user_id == User.id)
                .where(UserSession.token_hash == hash_token(token), UserSession.expires_at > utcnow())
            )
        )


@app.middleware("http")
async def csrf_and_security_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
    """Defensa CSRF en profundidad (además de SameSite=Lax) y cabeceras de seguridad.

    - Si llega `Origin`, debe ser uno de los orígenes permitidos.
    - Las peticiones que modifican estado deben llevar `X-Requested-With: XMLHttpRequest`:
      un formulario de otro sitio no puede enviarla, y desde JS obliga a un preflight CORS.
    """
    # Cuentas bloqueadas: TODAS sus peticiones a la API reciben 403 (salvo cerrar sesión).
    if request.url.path.startswith("/api/") and request.url.path not in _BAN_EXEMPT:
        token = request.cookies.get(settings.session_cookie)
        if token and len(token) <= 128 and await run_in_threadpool(_is_banned_session, token):
            return JSONResponse(status_code=403, content={"detail": BANNED_DETAIL})

    if request.method in _UNSAFE_METHODS and request.url.path.startswith("/api/"):
        origin = request.headers.get("origin")
        if origin is not None and origin not in settings.cors_origins:
            return JSONResponse(status_code=403, content={"detail": "Origin not allowed"})
        if request.headers.get("x-requested-with") != "XMLHttpRequest":
            return JSONResponse(status_code=403, content={"detail": "Missing CSRF header"})

    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Cache-Control", "no-store")
    # La API solo sirve JSON: no debe poder ejecutar ni incrustar nada.
    response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
    if settings.is_production:
        response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    return response


app.add_middleware(BodySizeLimitMiddleware)

# Añadido el último para que sea el más externo y responda a los preflight CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-Requested-With"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # El detalle se registra solo en el servidor; el cliente recibe un mensaje genérico.
    request_id = uuid.uuid4().hex
    logger.exception("Unhandled error [%s] %s %s", request_id, request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id},
    )


@app.get("/api/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router)
