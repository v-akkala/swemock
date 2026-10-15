import pytest

from jobq.errors import InvalidState
from jobq.models import DEAD, DONE, QUEUED, RUNNING
from jobq.transitions import check


def test_legal_changes_pass():
    assert check(QUEUED, RUNNING) == RUNNING
    assert check(RUNNING, DONE) == DONE
    assert check(RUNNING, QUEUED) == QUEUED
    assert check(RUNNING, DEAD) == DEAD
    assert check(DEAD, QUEUED) == QUEUED


@pytest.mark.parametrize("old,new", [(QUEUED, DONE), (DONE, QUEUED), (DEAD, DONE), (QUEUED, QUEUED)])
def test_illegal_changes_raise(old, new):
    with pytest.raises(InvalidState):
        check(old, new)
