import datetime
import re

from .errors import InvalidDate

_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def parse_date(text):
    """'2024-03-05' -> date."""
    try:
        return datetime.date.fromisoformat(text.strip())
    except ValueError:
        raise InvalidDate(f"not a valid date (use YYYY-MM-DD): {text!r}") from None


def parse_month(text):
    """Validate 'YYYY-MM' and return it unchanged."""
    text = text.strip()
    if not _MONTH.match(text):
        raise InvalidDate(f"not a valid month (use YYYY-MM): {text!r}")
    return text


def month_key(day):
    """date -> 'YYYY-MM'."""
    return f"{day.year:04d}-{day.month:02d}"


def month_bounds(month):
    """The first and last day of a 'YYYY-MM' month."""
    year, number = (int(part) for part in parse_month(month).split("-"))
    first = datetime.date(year, number, 1)
    following = datetime.date(year + number // 12, number % 12 + 1, 1)
    return first, following - datetime.timedelta(days=1)
