class RetryPolicy:
    """How often a failing job is tried and how long to wait between tries."""

    def __init__(self, max_attempts=3, delay=10):
        if max_attempts < 1:
            raise ValueError("max_attempts must be at least 1")
        if delay < 0:
            raise ValueError("delay must not be negative")
        self.max_attempts = max_attempts
        self.delay = delay

    def should_retry(self, attempts):
        """True while the job has attempts left after `attempts` tries."""
        return attempts < self.max_attempts

    def next_delay(self, failures):
        """Seconds to wait before the next try, after `failures` failed tries."""
        return self.delay
