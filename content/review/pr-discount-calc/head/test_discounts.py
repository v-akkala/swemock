import pytest

from pricing import apply_discount


def test_ten_percent_off():
    assert apply_discount(1000, 10) == 900


def test_rounds_the_discount_half_up():
    assert apply_discount(5, 10) == 4
    assert apply_discount(1999, 10) == 1799


def test_cap_limits_the_discount():
    assert apply_discount(10000, 50, cap_cents=1000) == 9000


def test_zero_and_full_discount():
    assert apply_discount(1234, 0) == 1234
    assert apply_discount(1234, 100) == 0


def test_percent_out_of_range_is_rejected():
    with pytest.raises(ValueError):
        apply_discount(100, 101)
    with pytest.raises(ValueError):
        apply_discount(100, -1)
