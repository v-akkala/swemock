import pytest

from pipeline import run
from reader import RowError, read_rows
from transform import dedupe, to_cents, unique_customers


def test_bug_last_row_lost():
    assert len(read_rows("a,b\n1,2\n3,4")) == 2


def test_bug_wrong_line_number():
    with pytest.raises(RowError, match="line 3"):
        read_rows("a,b\n1,2\n3\n")


def test_bug_float_cents():
    assert to_cents("19.99") == 1999
    assert to_cents("0.29") == 29


def test_bug_shared_seen():
    rows = [{"order_id": "x1"}, {"order_id": "x2"}]
    assert len(dedupe(rows)) == 2
    assert len(dedupe(rows)) == 2


class Counted:
    calls = 0

    def __init__(self, name):
        self.name = name

    def __eq__(self, other):
        Counted.calls += 1
        return self.name == other.name

    def __hash__(self):
        return hash(self.name)


def test_bug_quadratic_customers():
    Counted.calls = 0
    rows = [{"customer": Counted(f"c{i}")} for i in range(300)]
    assert len(unique_customers(rows)) == 300
    assert Counted.calls < 2000


def test_bug_silent_skip():
    text = "order_id,region,customer,amount\ns1,east,ann,10.00\ns2,east,bob,oops\n"
    report = run(text)
    assert report["skipped"] == ["s2"]
    assert report["rows"] == 1
