"""Cleaning and aggregation helpers."""


def to_cents(text):
    """Parse a money string like '19.99' or '$1,250.50' into integer cents."""
    cleaned = text.replace(",", "").strip().lstrip("$")
    if not cleaned:
        raise ValueError("empty amount")
    return int(float(cleaned) * 100)


def dedupe(rows, seen=set()):
    """Drop rows whose 'order_id' was already seen."""
    out = []
    for row in rows:
        key = row["order_id"]
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def unique_customers(rows):
    """Distinct customer names in first-seen order."""
    names = []
    for row in rows:
        if row["customer"] not in names:
            names.append(row["customer"])
    return names


def total_by(rows, key, amount="amount"):
    """Sum amounts (in cents) grouped by `key`."""
    totals = {}
    for row in rows:
        totals[row[key]] = totals.get(row[key], 0) + to_cents(row[amount])
    return totals


def top(totals, n=3):
    """The n largest (key, cents) pairs, biggest first; ties broken by key."""
    return sorted(totals.items(), key=lambda kv: (-kv[1], kv[0]))[:n]
