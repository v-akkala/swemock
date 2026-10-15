class JobError(Exception):
    """Base class for queue errors."""


class UnknownJob(JobError):
    """No job has this id."""


class InvalidState(JobError):
    """The requested state change is not allowed."""


class UnknownHandler(JobError):
    """No handler is registered for this job name."""
