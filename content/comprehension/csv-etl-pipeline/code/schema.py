"""Column definitions for the sales export."""

REQUIRED_COLUMNS = ("order_id", "region", "customer", "amount")
OPTIONAL_COLUMNS = ("note", "coupon")


class SchemaError(Exception):
    """The file does not look like a sales export."""


def check_header(header):
    """Raise SchemaError if a required column is missing or a name is repeated."""
    missing = [c for c in REQUIRED_COLUMNS if c not in header]
    if missing:
        raise SchemaError("missing columns: " + ", ".join(missing))
    seen = set()
    for name in header:
        if name in seen:
            raise SchemaError(f"duplicate column: {name}")
        seen.add(name)
    unknown = [c for c in header if c not in REQUIRED_COLUMNS and c not in OPTIONAL_COLUMNS]
    return unknown


def describe(header):
    """A one-line description of a header, for logs."""
    unknown = check_header(header)
    suffix = f" (ignoring: {', '.join(unknown)})" if unknown else ""
    return f"{len(header)} columns{suffix}"


def column_index(header, name):
    """Position of a column, or -1 when absent."""
    try:
        return header.index(name)
    except ValueError:
        return -1
