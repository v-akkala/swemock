class Worker:
    """Runs claimed jobs through their handlers."""

    def __init__(self, queue, registry):
        self.queue = queue
        self.registry = registry

    def run_once(self):
        """Run one due job; returns the finished job, or None when the queue is idle."""
        job = self.queue.claim()
        if job is None:
            return None
        try:
            self.registry.get(job.name)(**job.payload)
        except Exception as error:  # noqa: BLE001 - any handler failure is a failed try
            return self.queue.fail(job.id, f"{type(error).__name__}: {error}")
        return self.queue.complete(job.id)

    def run_until_idle(self, limit=1000):
        """Keep running until nothing is due; returns how many jobs ran."""
        ran = 0
        while ran < limit and self.run_once() is not None:
            ran += 1
        return ran
