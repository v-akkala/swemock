"""Run the sales CSV through parsing, cleaning, and totals."""
import os

from reader import read_rows
from report import render
from transform import dedupe, to_cents, top, total_by, unique_customers


def run(text):
    """Process CSV text and return a report dict."""
    rows = dedupe(read_rows(text))
    skipped, good = [], []
    for row in rows:
        try:
            to_cents(row["amount"])
        except ValueError:
            continue
        good.append(row)
    totals = total_by(good, "region")
    return {
        "rows": len(good),
        "skipped": skipped,
        "totals": totals,
        "top_regions": top(totals),
        "customers": unique_customers(good),
    }


def run_and_render(text):
    return render(run(text))
