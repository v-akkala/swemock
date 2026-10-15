from .errors import ValidationError

MAX_TITLE = 120
NEW_FIELDS = {"title", "priority"}
PATCH_FIELDS = {"title", "done", "priority"}


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
    return fields


def clean_patch(body):
    """The fields to change on an existing todo."""
    _check_body(body, PATCH_FIELDS)
    if not body:
        raise ValidationError("nothing to update")
    cleaners = {"title": clean_title, "done": clean_done, "priority": clean_priority}
    return {name: cleaners[name](value) for name, value in body.items()}
