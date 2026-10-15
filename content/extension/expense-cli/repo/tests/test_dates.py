import datetime

import pytest

from expenses.dates import month_bounds, month_key, parse_date, parse_month
from expenses.errors import InvalidDate


def test_parse_date_and_month_key():
    day = parse_date("2024-03-05")
    assert day == datetime.date(2024, 3, 5) and month_key(day) == "2024-03"


def test_bad_dates_and_months():
    with pytest.raises(InvalidDate):
        parse_date("05/03/2024")
    with pytest.raises(InvalidDate):
        parse_month("2024-13")


def test_month_bounds_handle_leap_years_and_december():
    assert month_bounds("2024-02")[1] == datetime.date(2024, 2, 29)
    assert month_bounds("2023-12") == (datetime.date(2023, 12, 1), datetime.date(2023, 12, 31))
