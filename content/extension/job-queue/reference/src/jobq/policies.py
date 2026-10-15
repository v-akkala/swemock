import random

BACKOFFS = ("fixed", "exponential")


class RetryPolicy:
    """How often a failing job is tried and how long to wait between tries."""

    def __init__(self, max_attempts=3, delay=10, backoff="fixed", factor=2, cap=None, jitter=0.0, rng=None):
        if max_attempts < 1:
            raise ValueError("max_attempts must be at least 1")
        if delay < 0:
            raise ValueError("delay must not be negative")
        if backoff not in BACKOFFS:
            raise ValueError(f"backoff must be one of {BACKOFFS}")
        if factor < 1:
            raise ValueError("factor must be at least 1")
        if cap is not None and cap <= 0:
            raise ValueError("cap must be positive")
        if not 0 <= jitter <= 1:
            raise ValueError("jitter must be between 0 and 1")
        self.max_attempts = max_attempts
        self.delay = delay
        self.backoff = backoff
        self.factor = factor
        self.cap = cap
        self.jitter = jitter
        self.rng = rng or random.Random()

    def should_retry(self, attempts):
        """True while the job has attempts left after `attempts` tries."""
        return attempts < self.max_attempts

    def next_delay(self, failures):
        """Seconds to wait before the next try, after `failures` failed tries."""
        wait = self.delay
        if self.backoff == "exponential":
            wait = self.delay * self.factor ** (failures - 1)
            if self.cap is not None:
                wait = min(wait, self.cap)
        if self.jitter:
            wait *= 1 + self.rng.uniform(-self.jitter, self.jitter)
        return wait
