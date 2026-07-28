from __future__ import annotations

import hashlib
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Deque

from fastapi import HTTPException, Request


@dataclass(frozen=True)
class RateLimitRule:
    name: str
    max_requests: int
    window_seconds: int


PUBLIC_MAP_LIMIT = RateLimitRule("public-map", 20, 60)
PACKAGE_CREATE_LIMIT = RateLimitRule("single-date-package-create", 3, 60 * 60)
PACKAGE_STATUS_LIMIT = RateLimitRule("single-date-package-status", 120, 60)
PACKAGE_FILE_LIMIT = RateLimitRule("single-date-package-file", 120, 60)


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, Deque[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str, rule: RateLimitRule) -> int | None:
        now = time.monotonic()
        cutoff = now - rule.window_seconds
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= rule.max_requests:
                retry_after = max(1, int(rule.window_seconds - (now - hits[0])))
                return retry_after
            hits.append(now)
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


rate_limiter = InMemoryRateLimiter()


def _client_token(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    host = forwarded.split(",", 1)[0].strip() if forwarded else ""
    if not host and request.client:
        host = request.client.host
    user_agent = request.headers.get("user-agent", "")[:160]
    raw = f"{host or 'unknown'}|{user_agent}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def enforce_rate_limit(request: Request, rule: RateLimitRule) -> None:
    key = f"{rule.name}:{_client_token(request)}"
    retry_after = rate_limiter.check(key, rule)
    if retry_after is None:
        return
    raise HTTPException(
        status_code=429,
        detail=f"Too many requests. Please wait {retry_after} seconds and try again.",
        headers={"Retry-After": str(retry_after)},
    )

