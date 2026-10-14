import pytest

from rate_limiter import RateLimiter


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def test_extension_override_applies_to_that_key_only():
    limiter = RateLimiter(2, 0, Clock())
    limiter.set_limit("vip", 5, 0)
    assert limiter.tokens("other") == 2
    assert [limiter.allow("vip") for _ in range(5)] == [True] * 5
    assert not limiter.allow("vip")


def test_extension_override_before_first_request_starts_full():
    limiter = RateLimiter(2, 0, Clock())
    limiter.set_limit("vip", 9, 0)
    assert limiter.tokens("vip") == 9


def test_extension_lowering_capacity_caps_current_tokens():
    limiter = RateLimiter(10, 0, Clock())
    assert limiter.allow("u")
    limiter.set_limit("u", 3, 0)
    assert limiter.tokens("u") == 3


def test_extension_raising_capacity_keeps_tokens_and_uses_the_new_rate():
    clock = Clock()
    limiter = RateLimiter(2, 1, clock)
    assert limiter.allow("u", 2)
    limiter.set_limit("u", 10, 2)
    assert limiter.tokens("u") == 0
    clock.now = 3
    assert limiter.tokens("u") == 6


def test_extension_set_limit_validates_like_the_constructor():
    limiter = RateLimiter(2, 1, Clock())
    with pytest.raises(ValueError):
        limiter.set_limit("u", 0, 1)
    with pytest.raises(ValueError):
        limiter.set_limit("u", 1, -1)
