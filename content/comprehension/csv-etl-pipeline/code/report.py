"""Formatting of pipeline results for people."""


def format_cents(cents):
    """12345 -> '123.45'; negative values keep their sign."""
    sign = "-" if cents < 0 else ""
    whole, frac = divmod(abs(cents), 100)
    return f"{sign}{whole}.{frac:02d}"


def render(report):
    """A plain-text summary of a pipeline report."""
    lines = [f"Rows processed: {report['rows']}"]
    if report["skipped"]:
        lines.append("Skipped orders: " + ", ".join(report["skipped"]))
    lines.append("Totals by region:")
    for region, cents in sorted(report["totals"].items()):
        lines.append(f"  {region}: {format_cents(cents)}")
    lines.append(f"Customers: {len(report['customers'])}")
    return "\n".join(lines)
