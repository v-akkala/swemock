import pytest

from manager import AuthError, SessionManager


class Clock:
    def __init__(self):
        self.t = 1000

    def __call__(self):
        return self.t


def make(**kw):
    clock = Clock()
    mgr = SessionManager("s3cret", clock, check_password=lambda u, p: p == "pw", **kw)
    return mgr, clock


def test_login_and_validate():
    mgr, _ = make()
    token = mgr.login("alice", "pw")
    assert mgr.validate(token) == "alice"
    assert mgr.validate("nope") is None


def test_bad_password_is_rejected():
    mgr, _ = make()
    with pytest.raises(AuthError):
        mgr.login("alice", "wrong")


def test_session_expires_after_ttl():
    mgr, clock = make(ttl=100, idle_timeout=1000)
    token = mgr.login("alice", "pw")
    clock.t += 101
    assert mgr.validate(token) is None


def test_logout_removes_the_session():
    mgr, _ = make()
    token = mgr.login("alice", "pw")
    assert mgr.logout(token) is True
    assert mgr.validate(token) is None


def test_at_most_max_per_user_sessions_are_kept_after_many_logins():
    mgr, clock = make(max_per_user=2)
    for _ in range(4):
        mgr.login("alice", "pw")
        clock.t += 1
    assert len(mgr.store.for_user("alice")) <= 3
