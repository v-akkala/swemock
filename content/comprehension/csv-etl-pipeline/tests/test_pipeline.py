from pipeline import run, run_and_render
from reader import RowError, read_rows, split_fields
from transform import dedupe, to_cents, top

SALES = "order_id,region,customer,amount\n1,east,ann,10.00\n2,west,bob,2.50\n3,east,cy,5.25\n"


def test_split_fields_handles_quotes():
    assert split_fields('a,"b,c","say ""hi"""') == ["a", "b,c", 'say "hi"']


def test_read_rows_builds_dicts():
    rows = read_rows(SALES)
    assert len(rows) == 3
    assert rows[0] == {"order_id": "1", "region": "east", "customer": "ann", "amount": "10.00"}


def test_blank_lines_are_ignored():
    assert len(read_rows("a,b\n\n1,2\n")) == 1


def test_wrong_field_count_raises():
    try:
        read_rows("a,b\n1\n")
    except RowError:
        return
    raise AssertionError("expected RowError")


def test_to_cents_simple_values():
    assert to_cents("10.00") == 1000
    assert to_cents("$1,250.50") == 125050


def test_top_orders_by_total():
    assert top({"a": 5, "b": 9, "c": 5}, 2) == [("b", 9), ("a", 5)]


def test_pipeline_totals_by_region():
    report = run(SALES)
    assert report["rows"] == 3
    assert report["totals"] == {"east": 1525, "west": 250}
    assert report["customers"] == ["ann", "bob", "cy"]


def test_render_mentions_regions():
    text = run_and_render(SALES.replace("1,east", "11,east").replace("2,west", "12,west").replace("3,east", "13,east"))
    assert "east: 15.25" in text and "Customers: 3" in text


def test_duplicates_are_dropped_within_one_run():
    assert len(dedupe([{"order_id": "1"}, {"order_id": "1"}], set())) == 1
