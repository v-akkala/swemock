import re

from .errors import ValidationError

MAX_TITLE = 120
MAX_TAGS = 5
MAX_TAG_LENGTH = 20
TAG_PATTERN = re.compile(r"^[a-z0-9-]+$")
NEW_FIELDS = {"title", "priority", "tags"}
PATCH_FIELDS = {"title", "done", "priority", "tags"}


def clean_title(value):
    if not isinstance(value, str):
        raise ValidationError("title must be a string", "title")
    title = value.strip()
    if not title:
        raise ValidationError("title must not be empty", "title")
    if len(title) > MAX_TITLE:
        raise ValidationError(f"title must be at most {MAX_TITLE} characters", "title")
    return title


def clean_priority(value):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValidationError("priority must be an integer", "priority")
    if not 1 <= value <= 5:
        raise ValidationError("priority must be between 1 and 5", "priority")
    return value


def clean_done(value):
    if not isinstance(value, bool):
        raise ValidationError("done must be true or false", "done")
    return value


def clean_tag(value, field="tags"):
    """One tag, lower-cased and trimmed."""
    if not isinstance(value, str):
        raise ValidationError("tags must be strings", field)
    tag = value.strip().lower()
    if not 1 <= len(tag) <= MAX_TAG_LENGTH or not TAG_PATTERN.match(tag):
        raise ValidationError(f"a tag is 1-{MAX_TAG_LENGTH} characters from a-z, 0-9 and -", field)
    return tag


def clean_tags(value):
    """A tuple of unique tags in first-seen order."""
    if not isinstance(value, list):
        raise ValidationError("tags must be a list", "tags")
    tags = tuple(dict.fromkeys(clean_tag(v) for v in value))
    if len(tags) > MAX_TAGS:
        raise ValidationError(f"at most {MAX_TAGS} tags", "tags")
    return tags


def parse_bool(text, field):
    """Parse a query-string boolean."""
    lowered = text.strip().lower()
    if lowered in ("true", "1", "yes"):
        return True
    if lowered in ("false", "0", "no"):
        return False
    raise ValidationError(f"{field} must be true or false", field)


def _check_body(body, allowed):
    if not isinstance(body, dict):
        raise ValidationError("request body must be a JSON object")
    unknown = sorted(set(body) - allowed)
    if unknown:
        raise ValidationError(f"unknown field: {unknown[0]}", unknown[0])


def clean_new_todo(body):
    """Fields for a new todo: the title is required, the rest default."""
    _check_body(body, NEW_FIELDS)
    if "title" not in body:
        raise ValidationError("title is required", "title")
    fields = {"title": clean_title(body["title"])}
    if "priority" in body:
        fields["priority"] = clean_priority(body["priority"])
    if "tags" in body:
        fields["tags"] = clean_tags(body["tags"])
    return fields


def clean_patch(body):
    """The fields to change on an existing todo."""
    _check_body(body, PATCH_FIELDS)
    if not body:
        raise ValidationError("nothing to update")
    cleaners = {"title": clean_title, "done": clean_done, "priority": clean_priority, "tags": clean_tags}
    return {name: cleaners[name](value) for name, value in body.items()}
