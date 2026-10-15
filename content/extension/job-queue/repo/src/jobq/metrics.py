class Metrics:
    """Plain counters."""

    NAMES = ("enqueued", "completed", "retried", "failed")

    def __init__(self):
        self._counts = {name: 0 for name in self.NAMES}

    def incr(self, name, amount=1):
        if name not in self._counts:
            raise KeyError(f"unknown metric: {name}")
        self._counts[name] += amount

    def snapshot(self):
        """A copy of all counters."""
        return dict(self._counts)
