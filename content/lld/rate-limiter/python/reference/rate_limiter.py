import time
from dataclasses import dataclass
from typing import Callable, Optional


@dataclass
class _Bucket:
    tokens: float
    last_update: float
    capacity: float
    rate: float


class RateLimiter:
    """A per-key token bucket rate limiter with optional per-key limits."""

    def __init__(self, capacity: float, refill_per_second: float, clock: Optional[Callable[[], float]] = None) -> None:
        self._validate(capacity, refill_per_second)
        self._capacity = capacity
        self._rate = refill_per_second
        self._clock = clock or time.monotonic
        self._buckets: dict[str, _Bucket] = {}
        self._overrides: dict[str, tuple[float, float]] = {}

    def allow(self, key: str, cost: float = 1) -> bool:
        if cost <= 0:
            raise ValueError("cost must be positive")
        bucket = self._refilled(key)
        if bucket.tokens < cost:
            return False
        bucket.tokens -= cost
        return True

    def tokens(self, key: str) -> float:
        return self._refilled(key).tokens

    def set_limit(self, key: str, capacity: float, refill_per_second: float) -> None:
        self._validate(capacity, refill_per_second)
        self._overrides[key] = (capacity, refill_per_second)
        if key not in self._buckets:
            return  # created lazily later, full, with this limit
        bucket = self._refilled(key)  # bring the bucket up to date under the old limit first
        bucket.capacity = capacity
        bucket.rate = refill_per_second
        bucket.tokens = min(bucket.tokens, capacity)

    # -- internals ---------------------------------------------------------------------------------

    @staticmethod
    def _validate(capacity: float, refill_per_second: float) -> None:
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        if refill_per_second < 0:
            raise ValueError("refill_per_second must not be negative")

    def _refilled(self, key: str) -> _Bucket:
        now = self._clock()
        bucket = self._buckets.get(key)
        if bucket is None:
            capacity, rate = self._overrides.get(key, (self._capacity, self._rate))
            bucket = self._buckets[key] = _Bucket(capacity, now, capacity, rate)
            return bucket
        elapsed = max(0.0, now - bucket.last_update)
        bucket.tokens = min(bucket.capacity, bucket.tokens + elapsed * bucket.rate)
        bucket.last_update = max(bucket.last_update, now)
        return bucket
