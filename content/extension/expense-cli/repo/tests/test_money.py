import pytest

from expenses.errors import InvalidAmount
from expenses.money import format_amount, parse_amount


@pytest.mark.parametrize("text,cents", [("12", 1200), ("12.5", 1250), ("$0.07", 7), ("3.05", 305)])
def test_parse_amount(text, cents):
    assert parse_amount(text) == cents


@pytest.mark.parametrize("text", ["", "abc", "-5", "1.234", "0", "0.00", "1,50"])
def test_bad_amounts(text):
    with pytest.raises(InvalidAmount):
        parse_amount(text)


def test_format_amount():
    assert format_amount(1250) == "$12.50"
    assert format_amount(5) == "$0.05"
    assert format_amount(-100) == "-$1.00"
