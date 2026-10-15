from orders import Order, average_order_value


def test_empty_input_is_zero():
    assert average_order_value([]) == 0.0


def test_rounding_to_cents():
    assert average_order_value([Order(1, 10.0), Order(2, 10.01)]) == 10.0
