"""Limitador de ventana deslizante en memoria.

Suficiente para un único proceso. Con varios workers o réplicas hay que moverlo a Redis.
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, status


class SlidingWindowLimiter:
    def __init__(self, max_events: int, window_seconds: int, message: str) -> None:
        self.max_events = max_events
        self.window_seconds = window_seconds
        self.message = message
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str) -> deque[float]:
        now = time.monotonic()
        events = self._events[key]
        while events and now - events[0] > self.window_seconds:
            events.popleft()
        return events

    def is_blocked(self, key: str) -> bool:
        return len(self._prune(key)) >= self.max_events

    def check(self, *keys: str) -> None:
        """Lanza 429 si alguna de las claves ha alcanzado el límite (sin registrar evento)."""
        if any(self.is_blocked(k) for k in keys):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=self.message,
                headers={"Retry-After": str(self.window_seconds)},
            )

    def hit(self, *keys: str) -> None:
        """Comprueba el límite y registra un evento para cada clave."""
        self.check(*keys)
        self.record(*keys)

    def record(self, *keys: str) -> None:
        now = time.monotonic()
        for k in keys:
            self._events[k].append(now)

    def reset(self, *keys: str) -> None:
        for k in keys:
            self._events.pop(k, None)
