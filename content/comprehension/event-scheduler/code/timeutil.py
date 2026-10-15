"""Calendar helpers on plain epoch seconds (UTC)."""
import datetime

EPOCH = datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)


def to_dt(ts):
    return EPOCH + datetime.timedelta(seconds=ts)


def to_ts(dt):
    return int((dt - EPOCH).total_seconds())


def at_time(ts, hour, minute):
    """The same day as ts, at hour:minute."""
    dt = to_dt(ts).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return to_ts(dt)


def next_weekday(ts, weekday):
    """The next date strictly after ts's day that falls on `weekday` (0=Monday), at midnight."""
    dt = to_dt(ts).replace(hour=0, minute=0, second=0, microsecond=0)
    ahead = (weekday - dt.weekday()) % 7 or 7
    return to_ts(dt + datetime.timedelta(days=ahead))


def start_of_next_day(ts):
    dt = to_dt(ts).replace(hour=0, minute=0, second=0, microsecond=0)
    return to_ts(dt + datetime.timedelta(days=1))
