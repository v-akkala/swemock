"""Parsing of the few HTTP headers the cache cares about."""


def parse_cache_control(value):
    """Turn 'max-age=60, no-store' into {'max-age': '60', 'no-store': True}."""
    directives = {}
    if not value:
        return directives
    for part in value.split(","):
        name, _, val = part.partition("=")
        directives[name.lower()] = val.strip('"') if val else True
    return directives


def parse_int(value, default=None):
    """int(value), or `default` when it is missing or not a number."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def lower_keys(headers):
    """A copy of a header dict with lower-case names."""
    return {name.lower(): value for name, value in headers.items()}


def vary_names(headers):
    """The header names listed in Vary, lower-cased ('*' means 'never reuse')."""
    value = headers.get("vary", "")
    return tuple(sorted(n.strip().lower() for n in value.split(",") if n.strip()))
