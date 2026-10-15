import datetime

import pytest

from expenses import storage
from expenses.budget import Budget
from expenses.errors import StorageError
from expenses.ledger import Ledger


def test_round_trip(tmp_path):
    path = tmp_path / "books.json"
    ledger = Ledger()
    ledger.add(1250, "food", "lunch", datetime.date(2024, 3, 5))
    storage.save(ledger, Budget({"food": 5000}), path)
    loaded, budget = storage.load(path)
    assert loaded.all() == ledger.all() and budget.limits == {"food": 5000}
    assert loaded.add(100, "x", "", datetime.date(2024, 3, 6)).id == 2


def test_missing_file_gives_empty_books(tmp_path):
    ledger, budget = storage.load(tmp_path / "none.json")
    assert ledger.all() == [] and budget.limits == {}


def test_bad_files_are_reported(tmp_path):
    path = tmp_path / "bad.json"
    path.write_text("{not json")
    with pytest.raises(StorageError):
        storage.load(path)
    path.write_text('{"version": 99}')
    with pytest.raises(StorageError):
        storage.load(path)


def test_version_one_files_still_load(tmp_path):
    path = tmp_path / "old.json"
    path.write_text('{"version": 1, "expenses": [], "budget": {"food": 100}}')
    ledger, budget = storage.load(path)
    assert ledger.recurring() == [] and budget.limits == {"food": 100}


def test_rules_round_trip(tmp_path):
    path = tmp_path / "books.json"
    ledger = Ledger()
    rule = ledger.add_recurring(1000, "rent", "flat", datetime.date(2024, 1, 31), "monthly", datetime.date(2024, 12, 31))
    storage.save(ledger, Budget(), path)
    loaded, _ = storage.load(path)
    assert loaded.recurring() == [rule]
