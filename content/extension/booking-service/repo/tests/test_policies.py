import pytest

from booking.errors import PolicyViolation
from booking.policies import Policy, check
from conftest import at

NOW = at(7, day=3)


def test_a_normal_booking_passes():
    check(Policy(), [], at(9), at(11), NOW)


@pytest.mark.parametrize(
    "start,end",
    [(at(9), at(14)), (at(7), at(9)), (at(19), at(21)), (at(6, day=3), at(7, day=3)), (at(9), at(10, day=5))],
)
def test_rule_violations(start, end):
    with pytest.raises(PolicyViolation):
        check(Policy(), [], start, end, NOW)


def test_active_booking_limit():
    with pytest.raises(PolicyViolation):
        check(Policy(max_active=2), ["a", "b"], at(9), at(10), NOW)


def test_closing_time_is_inclusive():
    check(Policy(), [], at(18), at(20), NOW)
