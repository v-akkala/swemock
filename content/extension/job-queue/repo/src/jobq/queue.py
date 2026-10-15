from dataclasses import replace

from .metrics import Metrics
from .models import DONE, FAILED, QUEUED, RUNNING
from .policies import RetryPolicy
from .store import JobStore
from .transitions import check


class JobQueue:
    def __init__(self, clock, policy=None, store=None, metrics=None):
        self.clock = clock
        self.policy = policy or RetryPolicy()
        self.store = store or JobStore()
        self.metrics = metrics or Metrics()

    def enqueue(self, name, payload=None, delay=0):
        """Add a job that becomes runnable after `delay` seconds; returns the job."""
        now = self.clock()
        job = self.store.add(name, payload or {}, run_at=now + delay, created_at=now)
        self.metrics.incr("enqueued")
        return job

    def claim(self):
        """Take the next runnable job and mark it running; None when nothing is due."""
        due = self.store.due(QUEUED, self.clock())
        if not due:
            return None
        job = due[0]
        return self.store.replace(replace(job, state=check(job.state, RUNNING), attempts=job.attempts + 1))

    def complete(self, job_id):
        """Mark a running job done; returns the job."""
        job = self.store.get(job_id)
        self.metrics.incr("completed")
        return self.store.replace(replace(job, state=check(job.state, DONE)))

    def fail(self, job_id, error):
        """Record a failed try; the job is retried later or ends up failed. Returns the job."""
        job = self.store.get(job_id)
        if self.policy.should_retry(job.attempts):
            self.metrics.incr("retried")
            run_at = self.clock() + self.policy.next_delay(job.attempts)
            return self.store.replace(replace(job, state=check(job.state, QUEUED), run_at=run_at, last_error=error))
        self.metrics.incr("failed")
        return self.store.replace(replace(job, state=check(job.state, FAILED), last_error=error))

    def get(self, job_id):
        """The job with this id."""
        return self.store.get(job_id)

    def stats(self):
        """Job counts per state plus the metric counters."""
        counts = {}
        for job in self.store.all():
            counts[job.state] = counts.get(job.state, 0) + 1
        return {"states": counts, "metrics": self.metrics.snapshot()}
