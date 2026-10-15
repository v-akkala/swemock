from .errors import InvalidState
from .models import DEAD, DONE, QUEUED, RUNNING

ALLOWED = {
    QUEUED: {RUNNING},
    RUNNING: {DONE, QUEUED, DEAD},
    DONE: set(),
    DEAD: {QUEUED},
}


def check(old, new):
    """Return `new` if the change old -> new is legal, otherwise raise InvalidState."""
    if new not in ALLOWED.get(old, set()):
        raise InvalidState(f"cannot move a job from {old} to {new}")
    return new
