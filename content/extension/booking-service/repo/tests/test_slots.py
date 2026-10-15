import pytest

from booking.errors import InvalidRequest
from booking.slots import check_interval, hours_between, overlaps
from conftest import at


def test_overlap_is_half_open():
    assert overlaps(at(9), at(11), at(10), at(12))
    assert not overlaps(at(9), at(10), at(10), at(11))


def test_interval_must_be_positive():
    with pytest.raises(InvalidRequest):
        check_interval(at(10), at(10))


def test_hours_between():
    assert hours_between(at(9), at(10, 30)) == 1.5
