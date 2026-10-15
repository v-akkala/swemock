import calendar
import datetime

EVERY = ("weekly", "monthly")


def _month_date(start, months):
    """The date `months` months after `start`, clamped to the end of a short month."""
    index = start.year * 12 + (start.month - 1) + months
    year, month = divmod(index, 12)
    month += 1
    return datetime.date(year, month, min(start.day, calendar.monthrange(year, month)[1]))


def occurrences(rule, first, last):
    """Dates in [first, last] on which the rule fires, in order."""
    end = last if rule.until is None else min(last, rule.until)
    found = []
    step = 0
    while True:
        if rule.every == "weekly":
            day = rule.start + datetime.timedelta(days=7 * step)
        else:
            day = _month_date(rule.start, step)
        if day > end:
            return found
        if day >= first:
            found.append(day)
        step += 1
