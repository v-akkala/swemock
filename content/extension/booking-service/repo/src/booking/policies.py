from dataclasses import dataclass

from .errors import PolicyViolation
from .slots import check_interval, hours_between


@dataclass(frozen=True)
class Policy:
    max_hours: float = 4
    open_hour: int = 8
    close_hour: int = 20
    max_active: int = 3


def check(policy, active_bookings, start, end, now):
    """Raise unless a booking for [start, end) is allowed given the user's active bookings."""
    check_interval(start, end)
    if start < now:
        raise PolicyViolation("bookings cannot start in the past")
    if start.date() != end.date():
        raise PolicyViolation("a booking must end on the day it starts")
    if start.hour < policy.open_hour or end.hour + (end.minute > 0) > policy.close_hour:
        raise PolicyViolation(f"rooms are open {policy.open_hour}:00 to {policy.close_hour}:00")
    if hours_between(start, end) > policy.max_hours:
        raise PolicyViolation(f"bookings are limited to {policy.max_hours} hours")
    if len(active_bookings) >= policy.max_active:
        raise PolicyViolation(f"at most {policy.max_active} active bookings per user")
