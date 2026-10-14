import pytest

from rate_limiter import RateLimiter


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def test_core_allows_up_to_capacity_then_denies():
    clock = Clock()
    limiter = RateLimiter(3, 1, clock)
    assert [limiter.allow("u") for _ in range(4)] == [True, True, True, False]


def test_core_refills_over_time():
    clock = Clock()
    limiter = RateLimiter(2, 1, clock)
    assert limiter.allow("u") and limiter.allow("u")
    assert not limiter.allow("u")
    clock.now = 1
    assert limiter.allow("u")
    assert not limiter.allow("u")


def test_core_keys_are_independent():
    limiter = RateLimiter(1, 0, Clock())
    assert limiter.allow("a")
    assert not limiter.allow("a")
    assert limiter.allow("b")


def test_edge_rejects_bad_arguments():
    with pytest.raises(ValueError):
        RateLimiter(0, 1)
    with pytest.raises(ValueError):
        RateLimiter(5, -1)
