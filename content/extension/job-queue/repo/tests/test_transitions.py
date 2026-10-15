import pytest

from jobq.errors import InvalidState
from jobq.models import DONE, FAILED, QUEUED, RUNNING
from jobq.transitions import check


def test_legal_changes_pass():
    assert check(QUEUED, RUNNING) == RUNNING
    assert check(RUNNING, DONE) == DONE
    assert check(RUNNING, QUEUED) == QUEUED


@pytest.mark.parametrize("old,new", [(QUEUED, DONE), (DONE, QUEUED), (FAILED, QUEUED), (QUEUED, QUEUED)])
def test_illegal_changes_raise(old, new):
    with pytest.raises(InvalidState):
        check(old, new)
