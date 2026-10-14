import pytest

from broker import Broker


class Clock:
    def __call__(self):
        return 0.0


def collect(broker, pattern):
    seen = []
    broker.subscribe(pattern, lambda m: seen.append(m.topic))
    return seen


def test_extension_star_matches_exactly_one_segment():
    broker = Broker(Clock())
    seen = collect(broker, "orders.*")
    for topic in ["orders.created", "orders.paid", "orders", "orders.paid.late", "users.created"]:
        broker.publish(topic, None)
    assert seen == ["orders.created", "orders.paid"]


def test_extension_star_can_come_first_or_in_the_middle():
    broker = Broker(Clock())
    a = collect(broker, "*.created")
    b = collect(broker, "orders.*.late")
    for topic in ["orders.created", "users.created", "orders.paid.late", "orders.paid"]:
        broker.publish(topic, None)
    assert a == ["orders.created", "users.created"]
    assert b == ["orders.paid.late"]


def test_extension_each_subscription_gets_a_message_once_in_subscription_order():
    broker = Broker(Clock())
    order = []
    broker.subscribe("orders.created", lambda m: order.append("exact"))
    broker.subscribe("orders.*", lambda m: order.append("wild"))
    broker.subscribe("*.*", lambda m: order.append("any2"))
    broker.publish("orders.created", None)
    assert order == ["exact", "wild", "any2"]


def test_extension_invalid_wildcard_subscriptions_are_still_rejected():
    broker = Broker(Clock())
    for bad in ["orders.**", "ord*ers", "", "a..b"]:
        with pytest.raises(ValueError):
            broker.subscribe(bad, print)
