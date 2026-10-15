import pytest

from manager import AuthError, SessionManager
from tokens import new_token


class Clock:
    def __init__(self):
        self.t = 1000

    def __call__(self):
        return self.t


def make(**kw):
    clock = Clock()
    mgr = SessionManager("s3cret", clock, check_password=lambda u, p: p == "pw", **kw)
    return mgr, clock


def test_bug_predictable_tokens():
    import random

    random.seed(1234)
    first = new_token()
    random.seed(1234)
    second = new_token()
    assert first != second


def test_bug_password_logged():
    mgr, _ = make()
    with pytest.raises(AuthError):
        mgr.login("alice", "hunter2")
    assert not any("hunter2" in line for line in mgr.log)


def test_bug_lockout_off_by_one():
    mgr, _ = make()
    for _ in range(5):
        with pytest.raises(AuthError):
            mgr.login("bob", "bad")
    with pytest.raises(AuthError) as err:
        mgr.login("bob", "pw")
    assert "too many" in str(err.value)


def test_bug_idle_session_kept():
    mgr, clock = make(idle_timeout=100, ttl=10000)
    token = mgr.login("carol", "pw")
    clock.t += 500
    assert mgr.validate(token) is None
    assert mgr.store.count() == 0


def test_bug_session_cap_plus_one():
    mgr, clock = make(max_per_user=2)
    for _ in range(4):
        mgr.login("dave", "pw")
        clock.t += 1
    assert len(mgr.store.for_user("dave")) == 2


def test_bug_constant_time_compare():
    import tokens

    calls = []
    original = tokens.hmac.compare_digest

    def spy(a, b):
        calls.append(1)
        return original(a, b)

    tokens.hmac.compare_digest = spy
    try:
        assert tokens.digests_match("abc", "abc") is True
    finally:
        tokens.hmac.compare_digest = original
    assert calls


def test_bug_index_leak():
    mgr, _ = make()
    for _ in range(3):
        token = mgr.login("erin", "pw")
        mgr.logout(token)
    assert len(mgr.store._by_user["erin"]) == 0
