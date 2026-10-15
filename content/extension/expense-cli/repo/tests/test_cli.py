from expenses.cli import main


def run(path, *argv):
    lines = []
    code = main(list(argv), str(path), out=lines.append)
    return code, lines


def test_add_list_and_remove(tmp_path):
    path = tmp_path / "books.json"
    assert run(path, "add", "12.50", "Food", "2024-03-05", "team", "lunch") == (0, ["added #1"])
    assert run(path, "list") == (0, ["#1 2024-03-05 food $12.50 team lunch"])
    assert run(path, "remove", "1") == (0, ["removed #1"])
    assert run(path, "list") == (0, [])


def test_report_with_budget(tmp_path):
    path = tmp_path / "books.json"
    run(path, "add", "30", "food", "2024-03-05")
    run(path, "budget", "set", "food", "100")
    code, lines = run(path, "report", "2024-03")
    assert code == 0
    assert lines[0].splitlines()[-1] == "  budget food: $70.00 left of $100.00"


def test_errors_exit_with_one(tmp_path):
    code, lines = run(tmp_path / "b.json", "add", "abc", "food", "2024-03-05")
    assert code == 1 and lines[0].startswith("error:")
    assert run(tmp_path / "b.json")[0] == 2
