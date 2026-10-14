import pytest

from rate_limiter import RateLimiter


class Clock:
    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now


def test_core_cost_spends_that_many_tokens():
    limiter = RateLimiter(10, 0, Clock())
    assert limiter.allow("u", 4)
    assert limiter.tokens("u") == 6
    assert limiter.allow("u", 6)
    assert not limiter.allow("u", 1)


def test_core_refill_is_capped_at_capacity():
    clock = Clock()
    limiter = RateLimiter(5, 2, clock)
    assert limiter.allow("u", 5)
    clock.now += 1000
    assert limiter.tokens("u") == 5


def test_core_fractional_refill_accumulates():
    clock = Clock()
    limiter = RateLimiter(2, 0.5, clock)
    assert limiter.allow("u", 2)
    clock.now += 1
    assert not limiter.allow("u")  # only 0.5 tokens
    clock.now += 1
    assert limiter.allow("u")  # 1.0 token


def test_core_unseen_key_starts_full():
    assert RateLimiter(7, 1, Clock()).tokens("new") == 7


def test_core_many_keys():
    clock = Clock()
    limiter = RateLimiter(3, 1, clock)
    for i in range(500):
        assert limiter.allow(f"user{i}")
    for i in range(500):
        assert limiter.tokens(f"user{i}") == 2


def test_edge_denied_request_spends_nothing():
    limiter = RateLimiter(3, 0, Clock())
    assert not limiter.allow("u", 4)
    assert limiter.tokens("u") == 3
    assert limiter.allow("u", 3)


def test_edge_clock_going_backwards_adds_no_tokens():
    clock = Clock()
    limiter = RateLimiter(2, 1, clock)
    assert limiter.allow("u", 2)
    clock.now -= 50
    assert not limiter.allow("u")
    clock.now += 50  # back to where the bucket last looked: still no time has passed
    assert not limiter.allow("u")
    clock.now += 1
    assert limiter.allow("u")


def test_edge_non_positive_cost_is_rejected():
    limiter = RateLimiter(3, 1, Clock())
    for bad in (0, -1):
        with pytest.raises(ValueError):
            limiter.allow("u", bad)


def test_edge_zero_refill_never_recovers():
    clock = Clock()
    limiter = RateLimiter(1, 0, clock)
    assert limiter.allow("u")
    clock.now += 10_000
    assert not limiter.allow("u")
