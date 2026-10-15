"""An in-process job scheduler driven by an explicit clock (call `tick`)."""
import heapq

from cronspec import parse
from jobs import Job
from next_run import next_after


class Scheduler:
    def __init__(self, now):
        self.now = now
        self.jobs = {}
        self._heap = []
        self._counter = 0
        self.history = []

    def add(self, spec_text, func, job_id=None, max_retries=0, retry_delay=30):
        spec = parse(spec_text)
        self._counter += 1
        job_id = job_id or f"job-{self._counter}"
        job = Job(job_id, spec_text, spec, func, next_after(spec, self.now()), max_retries, retry_delay)
        self.jobs[job_id] = job
        heapq.heappush(self._heap, (job.next_run, self._counter, job_id))
        return job

    def remove(self, job_id):
        return self.jobs.pop(job_id, None) is not None

    def pause(self, job_id):
        self.jobs[job_id].paused = True

    def resume(self, job_id):
        job = self.jobs[job_id]
        job.paused = False
        job.next_run = next_after(job.spec, self.now())
        self._push(job)

    def tick(self):
        """Run every job that is due. Returns the ids that ran, in order."""
        ran = []
        while self._heap and self._heap[0][0] <= self.now():
            due, _, job_id = heapq.heappop(self._heap)
            job = self.jobs.get(job_id)
            if job is None or job.paused or due != job.next_run:
                continue
            ran.append(job_id)
            self._run(job)
        return ran

    def _run(self, job):
        job.attempts += 1
        try:
            job.func()
        except Exception as error:
            job.failures += 1
            job.last_error = str(error)
            self.history.append((self.now(), job.id, "failed"))
            if job.attempts < job.max_retries:
                job.next_run = self.now() + job.retry_delay
                self._push(job)
                return
        else:
            job.runs += 1
            self.history.append((self.now(), job.id, "ok"))
        job.attempts = 0
        job.next_run = next_after(job.spec, job.next_run)
        self._push(job)

    def _push(self, job):
        self._counter += 1
        heapq.heappush(self._heap, (job.next_run, self._counter, job.id))

    def upcoming(self, limit=5):
        active = [j for j in self.jobs.values() if not j.paused]
        return [j.describe() for j in sorted(active, key=lambda j: j.next_run)[:limit]]
