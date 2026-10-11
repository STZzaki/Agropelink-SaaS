"""Subida segura de imágenes y vídeos cortos del foro (anti-inyección / anti-RCE / privacidad).

Capas, en orden:
1. Tipo real por magic bytes de la cabecera (nunca extensión ni Content-Type del cliente). Lista blanca:
   PNG, JPEG, WEBP y MP4 (ISO-BMFF con marca `ftyp` conocida). Texto, scripts o ejecutables → 415.
2. Nombre del cliente: cualquier extensión peligrosa en cualquier posición (`foto.php.jpg`) → 415.
3. Tamaño limitado DURANTE la lectura del stream (5 MB imágenes / 15 MB vídeo) → 413 sin agotar disco.
4. Búsqueda de código incrustado (`<?php`, `<script`, cabecera PE) en todo el archivo → 415.
5. Imágenes: se decodifican por completo con Pillow (límite de píxeles) y se vuelven a codificar desde los
   píxeles. Desaparecen metadatos EXIF/XMP (incluida la geolocalización GPS de la finca) y cualquier
   carga útil escondida en el archivo original (políglotas).
6. Vídeo: se valida la estructura de cajas MP4 (ftyp + moov + mdat, tamaños coherentes) y las cajas de
   metadatos (`udta`, `meta`, `uuid`: GPS, autor, XMP) se neutralizan como `free` del mismo tamaño
   (sin desplazar offsets: el vídeo sigue reproduciéndose).
7. Nombre final: UUIDv4 + extensión asignada por el servidor según el tipo validado. Directorio privado,
   servido solo a través de la API con `nosniff` y CSP `sandbox`.
"""

import hashlib
import io
import os
import struct
import uuid
import warnings
from dataclasses import dataclass
from pathlib import Path, PurePath
from typing import Literal

from fastapi import HTTPException, UploadFile, status
from PIL import Image

from config import get_settings
from storage import _DANGEROUS_EXTENSIONS, _EMBEDDED_CODE, sanitize_filename

_CHUNK = 64 * 1024
_OVERLAP = max(len(s) for s in _EMBEDDED_CODE) - 1
_UNSUPPORTED = "Tipo de archivo no permitido. Solo imágenes PNG, JPEG o WEBP y vídeos MP4."

# Marcas `ftyp` de MP4/ISO-BMFF admitidas (se excluye QuickTime `qt  ` y contenedores exóticos).
_MP4_BRANDS = {b"isom", b"iso2", b"iso4", b"iso5", b"iso6", b"mp41", b"mp42", b"avc1", b"M4V ", b"dash", b"MSNV", b"3gp5"}

Kind = Literal["image", "video"]


@dataclass(frozen=True)
class MediaType:
    mime: str
    ext: str
    kind: Kind
    client_exts: frozenset[str]
    pil_format: str | None = None


_TYPES = {
    "image/png": MediaType("image/png", ".png", "image", frozenset({".png"}), "PNG"),
    "image/jpeg": MediaType("image/jpeg", ".jpg", "image", frozenset({".jpg", ".jpeg", ".jpe", ".jfif"}), "JPEG"),
    "image/webp": MediaType("image/webp", ".webp", "image", frozenset({".webp"}), "WEBP"),
    "video/mp4": MediaType("video/mp4", ".mp4", "video", frozenset({".mp4", ".m4v"})),
}


@dataclass(frozen=True)
class StoredMedia:
    storage_key: str
    content_type: str
    kind: Kind
    size_bytes: int
    sha256: str
    width: int | None = None
    height: int | None = None


def _reject(detail: str = _UNSUPPORTED, code: int = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


def detect(header: bytes) -> MediaType | None:
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return _TYPES["image/png"]
    if header.startswith(b"\xff\xd8\xff"):
        return _TYPES["image/jpeg"]
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return _TYPES["image/webp"]
    if len(header) >= 12 and header[4:8] == b"ftyp" and header[8:12] in _MP4_BRANDS:
        return _TYPES["video/mp4"]
    return None


def media_dir() -> Path:
    path = Path(get_settings().forum_media_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _check_client_name(raw_name: str | None, media: MediaType) -> None:
    suffixes = [s.lower().strip() for s in PurePath(sanitize_filename(raw_name)).suffixes]
    if any(s in _DANGEROUS_EXTENSIONS for s in suffixes):
        raise _reject()
    if suffixes and suffixes[-1] not in media.client_exts:
        raise _reject()


# --- Imágenes: decodificar y recodificar desde los píxeles ------------------------------------------


def _reencode_image(raw: bytes, media: MediaType) -> tuple[bytes, int, int]:
    Image.MAX_IMAGE_PIXELS = get_settings().forum_image_max_pixels
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as probe:
                if probe.format != media.pil_format:
                    raise _reject()
                probe.verify()  # estructura y CRC
            with Image.open(io.BytesIO(raw)) as img:
                img.seek(0)  # animaciones (WEBP/PNG animado): solo el primer fotograma
                img.load()  # decodificación completa de los píxeles
                frame = img.copy()
    except HTTPException:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise _reject("La imagen es demasiado grande (resolución excesiva).", status.HTTP_413_CONTENT_TOO_LARGE) from None
    except Exception:
        raise _reject("La imagen está dañada o no es válida.") from None

    out = io.BytesIO()
    # Sin `exif`, `icc_profile` ni `pnginfo`: se descartan todos los metadatos del original.
    if media.pil_format == "JPEG":
        if frame.mode not in ("RGB", "L"):
            frame = frame.convert("RGB")
        frame.save(out, format="JPEG", quality=88, optimize=True, progressive=True)
    elif media.pil_format == "PNG":
        if frame.mode not in ("RGB", "RGBA", "L", "LA", "P"):
            frame = frame.convert("RGBA")
        frame.save(out, format="PNG", optimize=True)
    else:
        if frame.mode not in ("RGB", "RGBA"):
            frame = frame.convert("RGBA" if "A" in frame.getbands() else "RGB")
        frame.save(out, format="WEBP", quality=85, method=4)
    return out.getvalue(), frame.width, frame.height


# --- Vídeo: validar cajas MP4 y neutralizar metadatos ---------------------------------------------------

_METADATA_BOXES = {b"udta", b"meta", b"uuid", b"XMP_"}


def _iter_boxes(f, start: int, end: int):  # type: ignore[no-untyped-def]
    """Recorre cajas ISO-BMFF entre `start` y `end`: (offset, tamaño_total, tamaño_cabecera, tipo)."""
    pos = start
    while pos < end:
        f.seek(pos)
        head = f.read(8)
        if len(head) < 8:
            raise _reject("El vídeo MP4 está dañado.")
        size, box_type = struct.unpack(">I4s", head)
        header = 8
        if size == 1:
            large = f.read(8)
            if len(large) < 8:
                raise _reject("El vídeo MP4 está dañado.")
            size = struct.unpack(">Q", large)[0]
            header = 16
        elif size == 0:
            size = end - pos
        if size < header or pos + size > end or not all(32 <= c < 127 for c in box_type):
            raise _reject("El vídeo MP4 está dañado o no es un MP4 válido.")
        yield pos, size, header, box_type
        pos += size


def _neutralize(f, offset: int, size: int, header: int) -> None:  # type: ignore[no-untyped-def]
    f.seek(offset + 4)
    f.write(b"free")
    f.seek(offset + header)
    remaining = size - header
    while remaining > 0:
        n = min(remaining, _CHUNK)
        f.write(b"\x00" * n)
        remaining -= n


def _sanitize_mp4(path: Path) -> None:
    total = path.stat().st_size
    with path.open("r+b") as f:
        boxes = list(_iter_boxes(f, 0, total))
        types = [b[3] for b in boxes]
        if not types or types[0] != b"ftyp" or b"moov" not in types or b"mdat" not in types:
            raise _reject("El vídeo MP4 no tiene una estructura válida (ftyp/moov/mdat).")
        for offset, size, header, box_type in boxes:
            if box_type in _METADATA_BOXES:
                _neutralize(f, offset, size, header)
            elif box_type == b"moov":
                for c_off, c_size, c_header, c_type in list(_iter_boxes(f, offset + header, offset + size)):
                    if c_type in _METADATA_BOXES:
                        _neutralize(f, c_off, c_size, c_header)


# --- Punto de entrada --------------------------------------------------------------------------------


async def save_forum_upload(file: UploadFile, *, folder: Path | None = None, allow_video: bool = True) -> StoredMedia:
    """Pipeline completo. `folder`/`allow_video` permiten reutilizarlo (p. ej. fotos de fincas, solo imagen)."""
    settings = get_settings()
    header = await file.read(64)
    media = detect(header)
    if media is None or (media.kind == "video" and not allow_video):
        raise _reject() if media is None else _reject("Solo se admiten imágenes PNG, JPEG o WEBP.")
    _check_client_name(file.filename, media)

    limit = settings.forum_image_max_bytes if media.kind == "image" else settings.forum_video_max_bytes
    folder = folder or media_dir()
    folder.mkdir(parents=True, exist_ok=True)
    temp = folder / f"{uuid.uuid4().hex}.part"
    final_key = f"{uuid.uuid4().hex}{media.ext}"
    final = folder / final_key

    try:
        size, tail = len(header), header
        _scan(header)
        with temp.open("wb") as out:
            out.write(header)
            # Límite aplicado mientras se lee: nunca se escribe en disco más de `limit` bytes.
            while chunk := await file.read(_CHUNK):
                size += len(chunk)
                if size > limit:
                    raise _reject(
                        f"El archivo supera el máximo de {limit // (1024 * 1024)} MB para {'imágenes' if media.kind == 'image' else 'vídeos'}.",
                        status.HTTP_413_CONTENT_TOO_LARGE,
                    )
                _scan(tail + chunk)
                tail = chunk[-_OVERLAP:]
                out.write(chunk)

        width = height = None
        if media.kind == "image":
            data, width, height = _reencode_image(temp.read_bytes(), media)
            final.write_bytes(data)
            temp.unlink(missing_ok=True)
        else:
            _sanitize_mp4(temp)
            os.replace(temp, final)
    except BaseException:
        temp.unlink(missing_ok=True)
        final.unlink(missing_ok=True)
        raise

    digest = hashlib.sha256()
    with final.open("rb") as f:
        while chunk := f.read(_CHUNK):
            digest.update(chunk)
    return StoredMedia(final_key, media.mime, media.kind, final.stat().st_size, digest.hexdigest(), width, height)


def _scan(window: bytes) -> None:
    if any(sig in window.lower() for sig in _EMBEDDED_CODE):
        raise _reject("Archivo rechazado: contiene código incrustado.")


def media_path(storage_key: str, folder: Path | None = None) -> Path | None:
    """Ruta de un archivo multimedia generado por el servidor (valida formato y que no salga del directorio)."""
    name = PurePath(storage_key)
    if len(storage_key) > 40 or name.suffix not in {".png", ".jpg", ".webp", ".mp4"} or not name.stem.isalnum() or len(name.stem) != 32:
        return None
    base = (folder or media_dir()).resolve()
    path = (base / storage_key).resolve()
    return path if path.parent == base and path.is_file() else None


def farm_photo_dir() -> Path:
    path = Path(get_settings().farm_photo_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def delete_media(storage_key: str, folder: Path | None = None) -> None:
    path = media_path(storage_key, folder)
    if path is not None:
        path.unlink(missing_ok=True)
