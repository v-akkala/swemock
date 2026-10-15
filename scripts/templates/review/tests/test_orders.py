from orders import Order, average_order_value


def test_average_is_computed():
    assert average_order_value([Order(1, 10.0), Order(2, 20.0)]) == 15.0
