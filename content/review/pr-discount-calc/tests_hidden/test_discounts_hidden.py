from pricing import apply_discount


def test_cap_larger_than_discount_changes_nothing():
    assert apply_discount(1000, 10, cap_cents=5000) == 900


def test_zero_total():
    assert apply_discount(0, 25) == 0


def test_result_is_an_int():
    assert isinstance(apply_discount(999, 15), int)
