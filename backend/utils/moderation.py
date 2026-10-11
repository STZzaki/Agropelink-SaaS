"""Auto-Mod del foro: detección de lenguaje ofensivo en español y flujo de advertencias y bloqueos.

Flujo (se aplica ANTES de guardar nada en la base de datos):
- Primera infracción leve (insultos, vulgaridades): HTTP 400, el mensaje no se publica, `warnings_count += 1`
  y `pending_warning_ack = True`. El frontend muestra un modal obligatorio hasta que el usuario acepta la
  advertencia (`POST /api/v1/users/acknowledge-warning`); mientras tanto no puede publicar.
- Reincidencia tras haber sido advertido, o infracción grave (odio, amenazas, código malicioso): bloqueo
  permanente (`is_banned`) y revocación inmediata de todas sus sesiones (HTTP 403).

El diccionario vive en `profanities.json` (ver su `_doc` para la sintaxis de los términos).
"""

import json
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from config import get_settings
from models import ModerationAction, ModerationEvent, User
from security import utcnow

Severity = Literal["mild", "severe"]

WARNING_MESSAGE = (
    "Has recibido una advertencia oficial por incumplimiento de las normas de la comunidad. "
    "Reincidir supondrá la expulsión permanente de Agropelink."
)
PENDING_ACK_DETAIL = "Debes aceptar la advertencia oficial antes de volver a publicar en el foro."
BANNED_DETAIL = (
    "Tu cuenta ha sido suspendida por incumplir las normas de la comunidad. "
    "Si crees que es un error, escribe a info@agropelink.es."
)

_DICTIONARY = Path(__file__).with_name("profanities.json")

# Patrones de inyección (XSS, PHP, SQL, JNDI…). Se evalúan sobre el texto original, antes de sanear.
_MALICIOUS = re.compile(
    r"<\s*script|<\?php|javascript\s*:|\bon(?:error|load|click|mouseover|focus)\s*=|<\s*iframe|document\.cookie"
    r"|\bunion\s+(?:all\s+)?select\b|;\s*drop\s+table\b|'\s*or\s+'?1'?\s*=\s*'?1|\$\{jndi:|\bxp_cmdshell\b",
    re.IGNORECASE,
)

# Sustituciones "leet speak" habituales para esquivar filtros.
_LEET_NO_PUNCT = str.maketrans({"0": "o", "1": "i", "3": "e", "€": "e", "4": "a", "@": "a",
                                "5": "s", "$": "s", "7": "t", "8": "b", "9": "g"})
_GENDERED = re.compile(r"[oa]$")


# --- Normalización ---------------------------------------------------------------------------


def normalize(text: str) -> str:
    """minúsculas · sin tildes ni diacríticos (conserva la ñ) · leet → letras · sin separadores entre letras."""
    text = text.lower().replace("ñ", "\x00")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).replace("\x00", "ñ")
    text = " ".join(_deleet(token) for token in text.split())
    # Puntuación interpuesta dentro de una palabra: "p.u.t.a", "gili-pollas", "m*erda" → se elimina.
    text = re.sub(r"(?<=[a-zñ])[^\w\s]+(?=[a-zñ])", "", text)
    text = re.sub(r"[^a-zñ\s]", " ", text)
    return _join_spelled(" ".join(text.split()))


def _deleet(token: str) -> str:
    """Solo en palabras con letras ("put4", "1d10t4"); las cifras sueltas ("450 €") no se tocan.
    `!` e `|` solo cuentan como "i" entre dos letras, para que "idiota!" siga siendo "idiota"."""
    if not re.search(r"[a-zñ]", token):
        return token
    token = re.sub(r"(?<=[a-zñ])[!|](?=[a-zñ])", "i", token)
    return token.translate(_LEET_NO_PUNCT)


def _join_spelled(text: str) -> str:
    """Une letras sueltas consecutivas ("p u t a" → "puta") sin fusionar palabras reales entre sí."""
    out: list[str] = []
    run = ""
    for token in text.split():
        if len(token) == 1:
            run += token
            continue
        if run:
            out.append(run)
            run = ""
        out.append(token)
    if run:
        out.append(run)
    return " ".join(out)


# --- Compilación del diccionario ---------------------------------------------------------------


def _letters(word: str) -> str:
    # Cada letra admite repetición ("puuuuta", "mierdaaa") sin colapsar el texto analizado
    # (colapsarlo convertiría palabras legítimas como "perra" → "pera" en falsos positivos).
    return "".join(re.escape(ch) + "+" for ch in word)


def term_pattern(term: str) -> str:
    """Traduce un término del diccionario (ver sintaxis en profanities.json) a una expresión regular."""
    term = normalize(term.rstrip("=*")) if " " in term else term
    if " " in term:  # frase: coincidencia exacta palabra a palabra
        return r"\s+".join(_letters(w) for w in term.split())
    if term.endswith("*"):  # raíz con cualquier terminación
        return _letters(normalize(term[:-1])) + r"[a-zñ]*"
    if term.endswith("="):  # exacta + plural
        return _letters(normalize(term[:-1])) + r"(?:e?s)?"
    word = normalize(term)
    if _GENDERED.search(word):  # género y número: puta/puto/putas/putos
        return _letters(word[:-1]) + r"[oa]+s*"
    return _letters(word) + r"(?:e?s)?"


@dataclass(frozen=True)
class Rule:
    category: str
    severity: Severity
    pattern: re.Pattern[str]


@lru_cache
def rules() -> tuple[Rule, ...]:
    data = json.loads(_DICTIONARY.read_text(encoding="utf-8"))
    compiled = []
    # Primero las categorías graves: "moro de mierda" es odio, no solo una vulgaridad.
    for spec in sorted(data["categories"].values(), key=lambda c: c["severity"] != "severe"):
        alternatives = "|".join(term_pattern(t) for t in spec["terms"])
        compiled.append(Rule(spec["label"], spec["severity"], re.compile(rf"(?<![a-zñ])(?:{alternatives})(?![a-zñ])")))
    return tuple(compiled)


@dataclass(frozen=True)
class Verdict:
    severity: Severity
    category: str
    match: str


def analyze(*texts: str) -> Verdict | None:
    raw = "\n".join(texts)
    if m := _MALICIOUS.search(raw):
        return Verdict("severe", "código o patrones maliciosos", m.group(0))
    normalized = normalize(raw)
    for rule in rules():
        if m := rule.pattern.search(normalized):
            return Verdict(rule.severity, rule.category, m.group(0))
    return None


# --- Sanciones -----------------------------------------------------------------------------------


def _excerpt(text: str) -> str:
    one_line = " ".join(text.split())
    return one_line[:297] + "…" if len(one_line) > 300 else one_line


def ban_user(db: Session, user: User, reason: str, *, actor: User | None = None, excerpt: str | None = None) -> None:
    """Bloqueo permanente. No hace commit.

    Las sesiones no se borran: quedan inertes y el middleware global (main.py) las reconoce para responder
    403 a CUALQUIER petición de la cuenta bloqueada. Si un administrador la rehabilita, recupera el acceso.
    """
    user.is_banned = True
    user.banned_at = utcnow()
    user.ban_reason = reason[:300]
    user.pending_warning_ack = False
    db.add(
        ModerationEvent(
            user_id=user.id,
            action=ModerationAction.BAN,
            reason=reason[:300],
            excerpt=excerpt,
            automatic=actor is None,
            actor_id=actor.id if actor else None,
            created_at=utcnow(),
        )
    )


def require_no_pending_warning(user: User) -> None:
    """Mientras haya una advertencia sin aceptar, el usuario no puede publicar."""
    if user.pending_warning_ack:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=PENDING_ACK_DETAIL)


def enforce(db: Session, user: User, *texts: str) -> None:
    """Analiza el contenido antes de guardarlo. Si infringe las normas registra la sanción y lanza HTTP 400/403."""
    verdict = analyze(*texts)
    if verdict is None:
        return

    from sanitize import clean_text  # el extracto se guarda ya saneado

    excerpt = _excerpt(clean_text("\n".join(texts)))
    user.warnings_count += 1
    reincidence = user.warnings_count >= get_settings().moderation_ban_after_warnings

    if verdict.severity == "severe" or reincidence:
        reason = (
            f"Bloqueo automático por infracción grave: {verdict.category}."
            if verdict.severity == "severe"
            else f"Bloqueo automático por reincidencia tras advertencia oficial: {verdict.category}."
        )
        ban_user(db, user, reason, excerpt=excerpt)
        db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=BANNED_DETAIL)

    user.pending_warning_ack = True
    db.add(
        ModerationEvent(
            user_id=user.id,
            action=ModerationAction.WARNING,
            reason=f"Mensaje bloqueado automáticamente: {verdict.category}.",
            excerpt=excerpt,
            created_at=utcnow(),
        )
    )
    db.commit()
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Tu mensaje no se ha publicado: contiene {verdict.category}. {WARNING_MESSAGE}",
    )
