"""When does a schedule fire next?"""
from timeutil import at_time, next_weekday, start_of_next_day


def next_after(spec, after):
    """The first fire time strictly after `after` (epoch seconds)."""
    if spec.kind == "interval":
        return after + spec.interval
    if spec.kind == "daily":
        today = at_time(after, spec.hour, spec.minute)
        if today > after:
            return today
        return at_time(start_of_next_day(after), spec.hour, spec.minute)
    if spec.kind == "weekly":
        day = next_weekday(after, spec.weekday)
        return at_time(day, spec.hour, spec.minute)
    raise ValueError(spec.kind)
