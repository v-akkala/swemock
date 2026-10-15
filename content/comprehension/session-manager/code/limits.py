"""Rate limiting for login attempts."""


class LoginLimiter:
    def __init__(self, now, max_failures=5, window=300, lockout=900):
        self.now = now
        self.max_failures = max_failures
        self.window = window
        self.lockout = lockout
        self._failures = {}
        self._locked_until = {}

    def is_locked(self, user_id):
        until = self._locked_until.get(user_id)
        return until is not None and self.now() < until

    def record_failure(self, user_id):
        current = self.now()
        recent = [t for t in self._failures.get(user_id, []) if current - t < self.window]
        recent.append(current)
        self._failures[user_id] = recent
        if len(recent) > self.max_failures:
            self._locked_until[user_id] = current + self.lockout

    def record_success(self, user_id):
        self._failures.pop(user_id, None)
