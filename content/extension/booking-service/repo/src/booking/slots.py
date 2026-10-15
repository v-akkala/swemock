from .errors import InvalidRequest


def overlaps(a_start, a_end, b_start, b_end):
    """True if the half-open intervals share any time."""
    return a_start < b_end and b_start < a_end


def check_interval(start, end):
    """Raise InvalidRequest unless start is before end."""
    if not start < end:
        raise InvalidRequest("the booking must end after it starts")


def hours_between(start, end):
    """Length of the interval in hours."""
    return (end - start).total_seconds() / 3600
