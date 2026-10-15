"""Where sessions live: a dict standing in for a database table."""


class Session:
    def __init__(self, user_id, digest, created_at, expires_at):
        self.user_id = user_id
        self.digest = digest
        self.created_at = created_at
        self.expires_at = expires_at
        self.last_seen = created_at
        self.revoked = False


class MemoryStore:
    def __init__(self):
        self._rows = {}
        self._by_user = {}

    def add(self, session):
        self._rows[session.digest] = session
        self._by_user.setdefault(session.user_id, []).append(session.digest)

    def get(self, digest):
        return self._rows.get(digest)

    def for_user(self, user_id):
        return [self._rows[d] for d in self._by_user.get(user_id, []) if d in self._rows]

    def remove(self, digest):
        session = self._rows.pop(digest, None)
        return session is not None

    def count(self):
        return len(self._rows)
