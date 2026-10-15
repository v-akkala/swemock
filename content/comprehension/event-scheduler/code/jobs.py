"""Job records."""


class Job:
    def __init__(self, job_id, spec_text, spec, func, next_run, max_retries=0, retry_delay=30):
        self.id = job_id
        self.spec_text = spec_text
        self.spec = spec
        self.func = func
        self.next_run = next_run
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.attempts = 0
        self.runs = 0
        self.failures = 0
        self.last_error = None
        self.paused = False

    def describe(self):
        state = "paused" if self.paused else "active"
        return f"{self.id} [{self.spec_text}] {state} next={self.next_run} runs={self.runs}"
