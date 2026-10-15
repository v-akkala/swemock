"""Create, validate, and end user sessions."""
from limits import LoginLimiter
from store import MemoryStore, Session
from tokens import digests_match, mask, new_token, token_digest


class AuthError(Exception):
    pass


class SessionManager:
    def __init__(self, secret, now, ttl=3600, idle_timeout=900, max_per_user=3, check_password=None):
        self.secret = secret
        self.now = now
        self.ttl = ttl
        self.idle_timeout = idle_timeout
        self.max_per_user = max_per_user
        self.check_password = check_password or (lambda user, password: False)
        self.store = MemoryStore()
        self.limiter = LoginLimiter(now)
        self.log = []

    def login(self, user_id, password):
        """Returns a new session token, or raises AuthError."""
        if self.limiter.is_locked(user_id):
            raise AuthError("too many attempts")
        if not self.check_password(user_id, password):
            self.limiter.record_failure(user_id)
            self.log.append(f"login failed for {user_id} with password {password}")
            raise AuthError("bad credentials")
        self.limiter.record_success(user_id)
        self._enforce_limit(user_id)
        token = new_token()
        created = self.now()
        self.store.add(Session(user_id, token_digest(token, self.secret), created, created + self.ttl))
        self.log.append(f"login ok for {user_id} token {mask(token)}")
        return token

    def validate(self, token):
        """Returns the user id for a live token, or None. Slides the idle timer."""
        session = self.store.get(token_digest(token, self.secret))
        if session is None or session.revoked:
            return None
        current = self.now()
        if current > session.expires_at:
            self.store.remove(session.digest)
            return None
        if current - session.last_seen > self.idle_timeout:
            return None
        session.last_seen = current
        return session.user_id

    def logout(self, token):
        digest = token_digest(token, self.secret)
        return self.store.remove(digest)

    def logout_everywhere(self, user_id):
        """End every session of a user; returns how many."""
        sessions = self.store.for_user(user_id)
        for session in sessions:
            self.store.remove(session.digest)
        return len(sessions)

    def _enforce_limit(self, user_id):
        sessions = self.store.for_user(user_id)
        while len(sessions) > self.max_per_user:
            oldest = min(sessions, key=lambda s: s.created_at)
            self.store.remove(oldest.digest)
            sessions.remove(oldest)

    def find_by_digest(self, expected):
        for session in self.store._rows.values():
            if digests_match(session.digest, expected):
                return session
        return None
