from .errors import InvalidState
from .models import DONE, FAILED, QUEUED, RUNNING

ALLOWED = {
    QUEUED: {RUNNING},
    RUNNING: {DONE, QUEUED, FAILED},
    DONE: set(),
    FAILED: set(),
}


def check(old, new):
    """Return `new` if the change old -> new is legal, otherwise raise InvalidState."""
    if new not in ALLOWED.get(old, set()):
        raise InvalidState(f"cannot move a job from {old} to {new}")
    return new
