"""A tiny schedule grammar: 'every 5m', 'every 2h', 'daily 09:30', 'weekly mon 08:00'."""
import re

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
UNITS = {"s": 1, "m": 60, "h": 3600}


class SpecError(ValueError):
    pass


class Spec:
    def __init__(self, kind, interval=None, hour=0, minute=0, weekday=None):
        self.kind = kind
        self.interval = interval
        self.hour = hour
        self.minute = minute
        self.weekday = weekday


def parse(text):
    """Parse a schedule string into a Spec."""
    text = text.strip().lower()
    m = re.fullmatch(r"every (\d+)([smh])", text)
    if m:
        seconds = int(m.group(1)) * UNITS[m.group(2)]
        if seconds <= 0:
            raise SpecError("interval must be positive")
        return Spec("interval", interval=seconds)
    m = re.fullmatch(r"daily (\d{2}):(\d{2})", text)
    if m:
        return Spec("daily", hour=_hour(m.group(1)), minute=_minute(m.group(2)))
    m = re.fullmatch(r"weekly (\w{3}) (\d{2}):(\d{2})", text)
    if m and m.group(1) in DAYS:
        return Spec("weekly", weekday=DAYS.index(m.group(1)), hour=_hour(m.group(2)), minute=_minute(m.group(3)))
    raise SpecError(f"cannot parse schedule: {text!r}")


def _hour(s):
    value = int(s)
    if value > 24:
        raise SpecError("hour out of range")
    return value


def _minute(s):
    value = int(s)
    if value > 59:
        raise SpecError("minute out of range")
    return value
