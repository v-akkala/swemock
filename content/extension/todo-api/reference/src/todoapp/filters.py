from dataclasses import dataclass
from typing import Optional

from .errors import ValidationError
from .validation import clean_tag, parse_bool


@dataclass(frozen=True)
class Filters:
    done: Optional[bool] = None
    q: Optional[str] = None
    priority: Optional[int] = None
    tags: tuple = ()


def _single(query, name):
    values = query.get(name)
    if not values:
        return None
    if len(values) > 1:
        raise ValidationError(f"{name} may be given only once", name)
    return values[0]


def parse_filters(query):
    """Build Filters from a query dict of lists; raises ValidationError on bad values."""
    done = _single(query, "done")
    q = _single(query, "q")
    priority = _single(query, "priority")
    if priority is not None:
        try:
            priority = int(priority)
        except ValueError:
            raise ValidationError("priority must be an integer", "priority") from None
    return Filters(
        done=parse_bool(done, "done") if done is not None else None,
        q=q.strip().lower() if q and q.strip() else None,
        priority=priority,
        tags=tuple(dict.fromkeys(clean_tag(t, "tag") for t in query.get("tag", []))),
    )


def apply_filters(todos, filters):
    result = todos
    if filters.done is not None:
        result = [t for t in result if t.done == filters.done]
    if filters.q is not None:
        result = [t for t in result if filters.q in t.title.lower()]
    if filters.priority is not None:
        result = [t for t in result if t.priority == filters.priority]
    for tag in filters.tags:
        result = [t for t in result if tag in t.tags]
    return result
