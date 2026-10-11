"""Validación y guardado de archivos subidos en almacenamiento privado (anti-malware / anti-RCE).

Capas de defensa:
1. Tipo real por *magic numbers* (bytes de cabecera); nunca se confía en la extensión ni en el
   `Content-Type` del cliente. Lista blanca: PDF, JPEG, PNG y WEBP.
2. Nombre del cliente: cualquier extensión peligrosa en cualquier posición (`shell.php.pdf`) → 415;
   la extensión final, si existe, debe corresponder al tipo detectado.
3. Contenido: se rechazan archivos políglotas con código incrustado (`<?php`, `<script`, ejecutables
   PE) y PDF con contenido activo (JavaScript, acciones de lanzamiento, archivos incrustados).
4. Almacenamiento: nombre UUIDv4 sin extensión, fuera de cualquier ruta servida, y descarga solo por
   streaming autenticado como adjunto (`Content-Disposition: attachment` + `nosniff`).
"""

import hashlib
import re
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path, PurePath

from fastapi import HTTPException, UploadFile, status

from config import get_settings

_CHUNK_SIZE = 64 * 1024

# Tipo MIME → (extensiones aceptadas en el nombre, comprobación de magic bytes).
_ALLOWED_TYPES: dict[str, tuple[frozenset[str], Callable[[bytes], bool]]] = {
    "application/pdf": (frozenset({".pdf"}), lambda h: h.startswith(b"%PDF-")),
    "image/png": (frozenset({".png"}), lambda h: h.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/jpeg": (frozenset({".jpg", ".jpeg", ".jpe", ".jfif"}), lambda h: h.startswith(b"\xff\xd8\xff")),
    "image/webp": (frozenset({".webp"}), lambda h: h[:4] == b"RIFF" and h[8:12] == b"WEBP"),
}

# Extensiones ejecutables o interpretables por un servidor o un navegador: prohibidas en cualquier posición.
_DANGEROUS_EXTENSIONS = frozenset(
    {
        ".php", ".php3", ".php4", ".php5", ".php7", ".php8", ".phtml", ".pht", ".phar", ".phps", ".inc",
        ".exe", ".dll", ".com", ".bat", ".cmd", ".msi", ".scr", ".pif", ".cpl", ".lnk", ".hta", ".vbs", ".vbe",
        ".wsf", ".ps1", ".psm1", ".sh", ".bash", ".zsh", ".csh", ".ksh", ".py", ".pyc", ".pyw", ".pl", ".cgi",
        ".rb", ".js", ".mjs", ".cjs", ".jsp", ".jspx", ".asp", ".aspx", ".ashx", ".asmx", ".war", ".jar",
        ".html", ".htm", ".xhtml", ".shtml", ".svg", ".xml", ".swf", ".htaccess", ".so", ".elf", ".bin", ".apk",
    }
)

# Firmas de código incrustado (archivos políglotas). Se buscan en todo el archivo, sin distinguir mayúsculas.
_EMBEDDED_CODE = (b"<?php", b"<script", b"this program cannot be run in dos mode")
# Contenido activo en PDF (nombres de diccionario de 7+ bytes: sin falsos positivos por azar).
_PDF_ACTIVE = (b"/javascript", b"/launch", b"/embeddedfile", b"/richmedia")
_OVERLAP = max(len(s) for s in (*_EMBEDDED_CODE, *_PDF_ACTIVE)) - 1

# Clave de almacenamiento: UUIDv4 en hex (las subidas antiguas pueden conservar su extensión).
_STORAGE_KEY = re.compile(r"^[0-9a-f]{32}(?:\.(?:pdf|png|jpg|webp))?$")

# Alias que algunos navegadores declaran para el mismo formato.
_DECLARED_ALIASES = {"image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg", "application/x-pdf": "application/pdf"}
# Tipo genérico que algunos clientes envían cuando no saben el formato: se admite, manda el contenido real.
_GENERIC_DECLARED = {"", "application/octet-stream"}

_UNSUPPORTED = "Unsupported file type. Allowed: PDF, PNG, JPEG, WEBP"


@dataclass(frozen=True)
class StoredFile:
    storage_key: str
    content_type: str
    size_bytes: int
    sha256: str


def _reject(detail: str = _UNSUPPORTED) -> HTTPException:
    return HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=detail)


def _detect_content_type(header: bytes) -> str | None:
    for content_type, (_exts, matches) in _ALLOWED_TYPES.items():
        if matches(header):
            return content_type
    return None


def sanitize_filename(raw: str | None) -> str:
    """Nombre original solo para mostrar: sin rutas, sin caracteres de control, longitud acotada."""
    name = PurePath((raw or "").replace("\\", "/")).name
    name = "".join(ch for ch in name if ch.isprintable()).strip()
    return name[:255] or "documento"


def check_filename(name: str, content_type: str) -> None:
    """Rechaza extensiones peligrosas en cualquier posición y extensiones finales que no cuadren con el tipo real."""
    suffixes = [s.lower().strip() for s in PurePath(name).suffixes]
    if any(s in _DANGEROUS_EXTENSIONS for s in suffixes) or name.lower().startswith(".ht"):
        raise _reject()
    if suffixes and suffixes[-1] not in _ALLOWED_TYPES[content_type][0]:
        raise _reject()


def _scan(window: bytes, content_type: str) -> None:
    lowered = window.lower()
    if any(sig in lowered for sig in _EMBEDDED_CODE):
        raise _reject("Rejected file: embedded code detected")
    if content_type == "application/pdf" and any(sig in lowered for sig in _PDF_ACTIVE):
        raise _reject("Rejected file: PDF with active content (JavaScript, launch actions or attachments)")


async def save_upload(file: UploadFile) -> StoredFile:
    settings = get_settings()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    header = await file.read(16)
    content_type = _detect_content_type(header)
    # Doble verificación: el tipo real (magic bytes) debe estar permitido Y coincidir con el declarado.
    declared = (file.content_type or "").split(";")[0].strip().lower()
    declared = _DECLARED_ALIASES.get(declared, declared)
    if content_type is None or (declared not in _GENERIC_DECLARED and declared != content_type):
        raise _reject()
    check_filename(sanitize_filename(file.filename), content_type)

    # Sin extensión: el archivo nunca se puede interpretar por su nombre aunque acabe en una ruta servida.
    storage_key = uuid.uuid4().hex
    destination = upload_dir / storage_key

    digest = hashlib.sha256(header)
    size = len(header)
    tail = header
    try:
        with destination.open("wb") as out:
            out.write(header)
            while chunk := await file.read(_CHUNK_SIZE):
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail=f"File too large. Max {settings.max_upload_bytes} bytes",
                    )
                # La ventana incluye el final del bloque anterior: una firma partida entre bloques también se detecta.
                _scan(tail + chunk, content_type)
                tail = chunk[-_OVERLAP:]
                digest.update(chunk)
                out.write(chunk)
            if size == len(header):
                _scan(header, content_type)
    except BaseException:
        destination.unlink(missing_ok=True)
        raise

    return StoredFile(storage_key=storage_key, content_type=content_type, size_bytes=size, sha256=digest.hexdigest())


def _stored_path(storage_key: str) -> Path:
    """Ruta en disco de una clave generada por el servidor; valida el formato y que no salga del directorio."""
    if not _STORAGE_KEY.fullmatch(storage_key):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    base = Path(get_settings().upload_dir).resolve()
    path = (base / storage_key).resolve()
    if path.parent != base or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return path


def iter_stored(storage_key: str) -> Iterator[bytes]:
    path = _stored_path(storage_key)

    def generator() -> Iterator[bytes]:
        with path.open("rb") as f:
            while chunk := f.read(_CHUNK_SIZE):
                yield chunk

    return generator()


def read_stored(storage_key: str, max_bytes: int) -> bytes | None:
    """Contenido completo si no supera `max_bytes` (para el análisis con IA); None si es mayor."""
    path = _stored_path(storage_key)
    if path.stat().st_size > max_bytes:
        return None
    return path.read_bytes()


def delete_stored(storage_key: str) -> None:
    if _STORAGE_KEY.fullmatch(storage_key):
        (Path(get_settings().upload_dir) / storage_key).unlink(missing_ok=True)
