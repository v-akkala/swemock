class RateLimiter:
    """A per-key token bucket rate limiter. See the spec for the contract."""

    def __init__(self, capacity: float, refill_per_second: float, clock=None) -> None:
        raise NotImplementedError

    def allow(self, key: str, cost: float = 1) -> bool:
        raise NotImplementedError

    def tokens(self, key: str) -> float:
        raise NotImplementedError
