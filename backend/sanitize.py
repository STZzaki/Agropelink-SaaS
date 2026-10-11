"""Saneado estricto de texto de usuario (foro, denuncias, solicitudes, soporte).

El contenido se almacena y se sirve como texto plano: se eliminan las etiquetas HTML y el contenido
de `<script>`/`<style>`, los caracteres de control y los de dirección Unicode (ataques "Trojan
Source"). React escapa además todo al renderizar: es defensa en profundidad frente a XSS almacenado.
"""

import re
import unicodedata
from html.parser import HTMLParser

_DROP_CONTENT = {"script", "style", "iframe", "object", "embed", "template", "noscript", "svg", "math"}
# Bidi, ancho cero y otros invisibles que permiten disfrazar texto.
_INVISIBLE = re.compile("[​-‏‪-‮⁠-⁤⁦-⁩﻿]")
_MANY_BLANK_LINES = re.compile(r"\n{3,}")


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:  # type: ignore[no-untyped-def]
        if tag in _DROP_CONTENT:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in _DROP_CONTENT and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._skip_depth:
            self.parts.append(data)


def _strip_once(text: str) -> str:
    parser = _TextExtractor()
    parser.feed(text)
    parser.close()
    return "".join(parser.parts)


def strip_tags(text: str) -> str:
    # Varias pasadas: `&lt;script&gt;` se decodifica en la primera y se elimina en la siguiente.
    for _ in range(3):
        stripped = _strip_once(text)
        if stripped == text:
            break
        text = stripped
    return text


def clean_text(text: str, *, multiline: bool = True) -> str:
    text = unicodedata.normalize("NFC", text)
    text = strip_tags(text)
    text = _INVISIBLE.sub("", text)
    allowed = {"\n", "\t"} if multiline else set()
    text = "".join(ch for ch in text if ch in allowed or unicodedata.category(ch)[0] != "C")
    if not multiline:
        return " ".join(text.split())
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]
    return _MANY_BLANK_LINES.sub("\n\n", "\n".join(lines)).strip()
