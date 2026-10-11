"""Multimedia del foro: magic bytes, límites en stream, código incrustado, recodificación sin metadatos, MP4 y acceso."""

import io
import re
import struct
from pathlib import Path

import pytest
from PIL import Image

from config import get_settings

GPS_TAG = 0x8825


def _image(fmt="JPEG", size=(64, 48), gps=False, comment=None):
    img = Image.new("RGB", size, (91, 173, 94))
    out = io.BytesIO()
    kwargs = {}
    if gps:
        exif = Image.Exif()
        exif[0x010F] = "CamaraFinca"  # Make
        exif.get_ifd(GPS_TAG).update({1: "N", 2: (36.0, 50.0, 30.0), 3: "W", 4: (2.0, 27.0, 50.0)})
        kwargs["exif"] = exif.tobytes()
    img.save(out, format=fmt, **kwargs)
    data = out.getvalue()
    return data + comment if comment else data


def _box(box_type: bytes, payload: bytes = b"") -> bytes:
    return struct.pack(">I4s", 8 + len(payload), box_type) + payload


def _mp4(with_metadata=True, extra=b""):
    ftyp = _box(b"ftyp", b"isom" + b"\x00\x00\x02\x00" + b"isomiso2avc1mp41")
    udta = _box(b"udta", _box(b"\xa9xyz", b"+36.8417-002.4639/"))
    moov = _box(b"moov", _box(b"mvhd", b"\x00" * 100) + (udta if with_metadata else b""))
    mdat = _box(b"mdat", b"\x00\x00\x00\x01video-data" * 50 + extra)
    return ftyp + moov + mdat


def _upload(c, name, content, mime, accepted=True):
    data = {"rights_accepted": "true"} if accepted else {}
    return c.post("/api/v1/forum/upload", data=data, files={"file": (name, content, mime)})


def _stored(url):
    return Path(get_settings().forum_media_dir) / url.rsplit("/", 1)[1]


def _dir_snapshot():
    path = Path(get_settings().forum_media_dir)
    return set(path.glob("*")) if path.exists() else set()


class TestValidUploads:
    @pytest.mark.parametrize(("fmt", "name", "mime", "ext"), [("JPEG", "foto.jpg", "image/jpeg", ".jpg"), ("PNG", "plano.png", "image/png", ".png"), ("WEBP", "x.webp", "image/webp", ".webp")])
    def test_images_renamed_with_uuid_and_server_extension(self, user, fmt, name, mime, ext):
        r = _upload(user, name, _image(fmt), mime)
        assert r.status_code == 201, r.text
        key = r.json()["url"].rsplit("/", 1)[1]
        assert re.fullmatch(rf"[0-9a-f]{{32}}\{ext}", key)
        assert r.json()["kind"] == "image" and r.json()["width"] == 64

    def test_exif_and_gps_are_stripped(self, user):
        original = _image("JPEG", gps=True)
        assert Image.open(io.BytesIO(original)).getexif().get_ifd(GPS_TAG)  # la original sí lleva GPS
        r = _upload(user, "parcela.jpg", original, "image/jpeg")
        stored = Image.open(_stored(r.json()["url"]))
        assert not stored.getexif() and b"CamaraFinca" not in _stored(r.json()["url"]).read_bytes()

    def test_mp4_metadata_neutralized_without_breaking_structure(self, user):
        original = _mp4()
        r = _upload(user, "riego.mp4", original, "video/mp4")
        assert r.status_code == 201, r.text
        data = _stored(r.json()["url"]).read_bytes()
        assert len(data) == len(original)  # mismos offsets: el vídeo sigue siendo reproducible
        assert b"udta" not in data and b"+36.8417" not in data and b"mdat" in data and data.startswith(original[:8])

    def test_client_extension_is_never_trusted(self, user):
        r = _upload(user, "foto", _image("PNG"), "application/octet-stream")  # sin extensión: manda el contenido
        assert r.status_code == 201 and r.json()["url"].endswith(".png")


class TestRejections:
    @pytest.mark.parametrize(
        ("name", "content", "mime", "code"),
        [
            ("shell.php", b"<?php system($_GET['c']); ?>", "image/jpeg", 415),  # texto/script
            ("x.jpg", b"MZ\x90\x00" + b"\x00" * 200, "image/jpeg", 415),  # ejecutable PE
            ("x.png", b"\x7fELF" + b"\x00" * 200, "image/png", 415),  # ejecutable ELF
            ("x.svg", b"<svg onload=alert(1)>", "image/svg+xml", 415),
            ("x.gif", b"GIF89a" + b"\x00" * 50, "image/gif", 415),  # formato no permitido
            ("foto.php.jpg", None, "image/jpeg", 415),  # doble extensión
            ("foto.png", None, "image/jpeg", 415),  # extensión ≠ contenido
            ("poli.jpg", "polyglot", "image/jpeg", 415),  # JPEG válido + PHP al final
            ("roto.jpg", b"\xff\xd8\xff\xe0" + b"basura" * 30, "image/jpeg", 415),  # cabecera válida, imagen falsa
            ("x.mov", b"\x00\x00\x00\x14ftypqt  \x00\x00\x00\x00qt  ", "video/quicktime", 415),
            ("x.mp4", b"\x00\x00\x00\x18ftypisom" + b"\x00" * 12 + b"\xff\xff\xff\xffzzzz", "video/mp4", 415),  # cajas incoherentes
            ("x.mp4", "mp4-script", "video/mp4", 415),  # MP4 con <script> incrustado
        ],
        ids=["php", "pe", "elf", "svg", "gif", "doble-ext", "ext-falsa", "poliglota", "jpeg-falso", "quicktime", "mp4-roto", "mp4-script"],
    )
    def test_malicious_or_invalid_files_rejected(self, user, name, content, mime, code):
        if content is None:
            content = _image("JPEG")
        elif content == "polyglot":
            content = _image("JPEG", comment=b"<?php eval($_POST['x']); ?>")
        elif content == "mp4-script":
            content = _mp4(extra=b"<script>alert(1)</script>")
        before = _dir_snapshot()
        r = _upload(user, name, content, mime)
        assert r.status_code == code, (name, r.text)
        assert _dir_snapshot() == before  # nada queda en disco

    def test_image_size_limit_enforced_in_stream(self, user):
        big = _image("PNG") + b"\x00" * (get_settings().forum_image_max_bytes + 1)
        assert _upload(user, "grande.png", big, "image/png").status_code == 413

    def test_video_size_limit_enforced_in_stream(self, user):
        big = _mp4(extra=b"\x00" * (get_settings().forum_video_max_bytes + 1))
        assert _upload(user, "largo.mp4", big, "video/mp4").status_code == 413

    def test_decompression_bomb_rejected(self, user):
        bomb = _image("PNG", size=(9000, 9000))  # 81 Mpx > límite de 40 Mpx, pero pocos KB comprimidos
        assert _upload(user, "bomba.png", bomb, "image/png").status_code == 413

    def test_legal_acceptance_required(self, user):
        assert _upload(user, "f.jpg", _image(), "image/jpeg", accepted=False).status_code == 422

    def test_requires_session(self, client):
        assert _upload(client, "f.jpg", _image(), "image/jpeg").status_code == 401


class TestPublishingAndAccess:
    def _thread(self, c, media_ids):
        body = {"category": "riego", "title": "Goteo en invernadero", "body": "Así queda el riego tras el cambio de goteros.", "media_ids": media_ids}
        return c.post("/api/v1/forum/threads", json=body)

    def test_attach_and_serve_inline_safely(self, user, client):
        media = _upload(user, "f.jpg", _image(), "image/jpeg").json()
        # Antes de publicar: solo lo ve quien lo subió.
        assert client.get(f"/api/v1{media['url']}").status_code == 404
        thread = self._thread(user, [media["id"]])
        assert thread.status_code == 201 and thread.json()["media_count"] == 1
        detail = client.get(f"/api/v1/forum/threads/{thread.json()['id']}").json()
        assert [m["id"] for m in detail["media"]] == [media["id"]]
        r = client.get(f"/api/v1{media['url']}")
        assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
        assert r.headers["x-content-type-options"] == "nosniff" and "sandbox" in r.headers["content-security-policy"]

    def test_video_supports_range_requests(self, user, client):
        media = _upload(user, "v.mp4", _mp4(), "video/mp4").json()
        self._thread(user, [media["id"]])
        r = client.get(f"/api/v1{media['url']}", headers={"Range": "bytes=0-15"})
        assert r.status_code == 206 and len(r.content) == 16

    def test_cannot_attach_foreign_or_reused_media(self, user, other_user):
        media = _upload(user, "f.jpg", _image(), "image/jpeg").json()
        assert self._thread(other_user, [media["id"]]).status_code == 422  # IDOR
        assert self._thread(user, [media["id"]]).status_code == 201
        assert self._thread(user, [media["id"]]).status_code == 422  # ya publicado

    def test_max_four_files_per_post(self, user):
        assert self._thread(user, [1, 2, 3, 4, 5]).status_code == 422

    def test_removed_thread_hides_media(self, user, admin, client):
        media = _upload(user, "f.jpg", _image(), "image/jpeg").json()
        thread_id = self._thread(user, [media["id"]]).json()["id"]
        admin.post(f"/api/v1/admin/forum/threads/{thread_id}/remove", json={"reason": "Contenido inapropiado"})
        assert client.get(f"/api/v1{media['url']}").status_code == 404

    @pytest.mark.parametrize("key", ["../../agropelink.db", "..%2F..%2Fagropelink.db", "x" * 32 + ".php", "a.jpg"])
    def test_path_traversal_and_unknown_keys(self, client, key):
        assert client.get(f"/api/v1/forum/media/{key}").status_code == 404

    def test_discard_unpublished_media(self, user, other_user):
        media = _upload(user, "f.jpg", _image(), "image/jpeg").json()
        assert other_user.delete(f"/api/v1/forum/upload/{media['id']}").status_code == 404
        assert user.delete(f"/api/v1/forum/upload/{media['id']}").status_code == 204
        assert not _stored(media["url"]).exists()
