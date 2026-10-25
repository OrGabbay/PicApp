# backend/rate_limit.py
"""Small in-memory rate limiting (single backend process; resets on restart)."""
import math
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

TOO_MANY_REQUESTS = "Too many requests. Please wait and try again."

# Requests from these addresses come through the Next.js proxy on the same machine,
# so the visitor's real address is in X-Forwarded-For. Anyone else can't spoof it.
TRUSTED_PROXIES = {"127.0.0.1", "::1"}


def client_ip(request: Request) -> str:
    direct = request.client.host if request.client else "unknown"
    if direct in TRUSTED_PROXIES:
        forwarded = request.headers.get("x-forwarded-for", "")
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return direct


class RateLimiter:
    """Allows at most `limit` hits per `window` seconds for each key (sliding window)."""

    def __init__(self, limit: int, window: float):
        self.limit = limit
        self.window = window
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, hits: deque, now: float) -> None:
        while hits and hits[0] <= now - self.window:
            hits.popleft()

    def retry_after(self, key: str) -> int:
        """Seconds until `key` may try again, or 0 if it is under the limit."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            self._prune(hits, now)
            if len(hits) < self.limit:
                return 0
            return max(1, math.ceil(hits[0] + self.window - now))

    def hit(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            self._prune(hits, now)
            hits.append(now)
            # Keep memory bounded: drop keys with no recent hits
            if len(self._hits) > 10_000:
                for stale in [k for k, v in self._hits.items() if not v]:
                    del self._hits[stale]

    def check(self, key: str) -> None:
        """Raises 429 if `key` is over the limit."""
        wait = self.retry_after(key)
        if wait:
            raise HTTPException(status_code=429, detail=TOO_MANY_REQUESTS, headers={"Retry-After": str(wait)})

    def check_and_hit(self, key: str) -> None:
        self.check(key)
        self.hit(key)


# Limits per endpoint
login_ip_limiter = RateLimiter(limit=20, window=5 * 60)          # all login attempts per IP
login_failure_limiter = RateLimiter(limit=5, window=15 * 60)     # wrong passwords per account + IP
login_account_limiter = RateLimiter(limit=50, window=60 * 60)    # wrong passwords per account, any IP
register_limiter = RateLimiter(limit=5, window=60 * 60)          # new accounts per IP
reset_ip_limiter = RateLimiter(limit=10, window=15 * 60)         # reset requests + confirmations per IP
reset_email_limiter = RateLimiter(limit=3, window=60 * 60)       # reset emails per account
guest_generation_limiter = RateLimiter(limit=5, window=60)       # guest images per IP
user_generation_limiter = RateLimiter(limit=15, window=60)       # images per logged-in user
enhance_limiter = RateLimiter(limit=20, window=60)               # prompt enhancements per IP
