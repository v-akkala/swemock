from .errors import UnknownJob
from .models import Job


class JobStore:
    """Keeps jobs by id. It applies no rules."""

    def __init__(self):
        self._jobs = {}
        self._next_id = 1

    def add(self, name, payload, run_at, created_at):
        """Create and return a new queued job."""
        job = Job(id=self._next_id, name=name, payload=payload, run_at=run_at, created_at=created_at)
        self._jobs[job.id] = job
        self._next_id += 1
        return job

    def get(self, job_id):
        try:
            return self._jobs[job_id]
        except KeyError:
            raise UnknownJob(f"job {job_id} does not exist") from None

    def replace(self, job):
        self.get(job.id)
        self._jobs[job.id] = job
        return job

    def all(self):
        """Every job, oldest first."""
        return [self._jobs[i] for i in sorted(self._jobs)]

    def due(self, state, now):
        """Jobs in `state` whose run_at has passed, earliest first."""
        ready = [j for j in self._jobs.values() if j.state == state and j.run_at <= now]
        return sorted(ready, key=lambda j: (j.run_at, j.id))
