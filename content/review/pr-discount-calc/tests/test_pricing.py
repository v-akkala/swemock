from pricing import line_total


def test_line_total():
    assert line_total(250, 4) == 1000
