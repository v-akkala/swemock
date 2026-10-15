from dataclasses import dataclass
from typing import Optional

QUEUED = "queued"
RUNNING = "running"
DONE = "done"
FAILED = "failed"

STATES = (QUEUED, RUNNING, DONE, FAILED)


@dataclass(frozen=True)
class Job:
    id: int
    name: str
    payload: dict
    state: str = QUEUED
    attempts: int = 0
    run_at: float = 0.0
    created_at: float = 0.0
    last_error: Optional[str] = None
