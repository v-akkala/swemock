import pytest

from broker import Broker


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def test_core_delivery_follows_subscription_order():
    broker = Broker(Clock())
    order = []
    for name in "abc":
        broker.subscribe("t", lambda m, name=name: order.append(name))
    broker.publish("t", None)
    assert order == ["a", "b", "c"]


def test_core_ids_increase_for_messages_and_subscriptions():
    broker = Broker(Clock())
    assert [broker.subscribe("t", print) for _ in range(3)] == [1, 2, 3]
    assert [broker.publish("t", i).id for i in range(3)] == [1, 2, 3]


def test_core_publish_without_subscribers_is_fine():
    broker = Broker(Clock())
    assert broker.publish("nobody.listens", 1).id == 1


def test_core_a_failing_handler_does_not_stop_the_others():
    broker = Broker(Clock())
    seen = []

    def boom(message):
        raise RuntimeError("bad handler")

    broker.subscribe("t", boom)
    ok = broker.subscribe("t", seen.append)
    message = broker.publish("t", 1)
    assert seen == [message]
    failures = broker.failures()
    assert [(f.message_id, f.subscription_id, f.error) for f in failures] == [(1, 1, "RuntimeError")]
    assert ok == 2


def test_core_timestamps_come_from_the_clock():
    clock = Clock()
    broker = Broker(clock)
    clock.now = 5
    assert broker.publish("t", 1).timestamp == 5
    clock.now = 9
    assert broker.publish("t", 2).timestamp == 9


def test_core_a_subscriber_added_during_delivery_misses_that_message():
    broker = Broker(Clock())
    late = []

    def add_late(message):
        broker.subscribe("t", late.append)

    broker.subscribe("t", add_late)
    broker.publish("t", 1)
    assert late == []
    broker.publish("t", 2)
    assert [m.payload for m in late] == [2]


def test_core_a_subscriber_removed_before_its_turn_gets_nothing():
    broker = Broker(Clock())
    seen = []
    second = []

    def remove_second(message):
        broker.unsubscribe(second_id)

    broker.subscribe("t", remove_second)
    second_id = broker.subscribe("t", seen.append)
    broker.publish("t", 1)
    assert seen == []


def test_core_messages_published_by_handlers_are_queued_in_order():
    broker = Broker(Clock())
    log = []

    def first(message):
        log.append(("first", message.payload))
        if message.payload == "a":
            broker.publish("t", "b")

    def second(message):
        log.append(("second", message.payload))

    broker.subscribe("t", first)
    broker.subscribe("t", second)
    broker.publish("t", "a")
    assert log == [("first", "a"), ("second", "a"), ("first", "b"), ("second", "b")]


def test_edge_unsubscribing_twice_or_an_unknown_id_raises():
    broker = Broker(Clock())
    sub = broker.subscribe("t", print)
    broker.unsubscribe(sub)
    for bad in (sub, 999):
        with pytest.raises(KeyError):
            broker.unsubscribe(bad)


def test_edge_wildcards_are_not_valid_when_publishing_or_by_default():
    broker = Broker(Clock())
    with pytest.raises(ValueError):
        broker.publish("orders.*", 1)
    with pytest.raises(ValueError):
        broker.publish("a..b", 1)


def test_edge_a_handler_that_publishes_in_a_loop_does_not_overflow_the_stack():
    broker = Broker(Clock())
    count = []

    def again(message):
        count.append(1)
        if len(count) < 3000:
            broker.publish("t", None)

    broker.subscribe("t", again)
    broker.publish("t", None)
    assert len(count) == 3000


def test_core_many_subscribers():
    broker = Broker(Clock())
    hits = [0] * 500
    for i in range(500):
        broker.subscribe("t", lambda m, i=i: hits.__setitem__(i, hits[i] + 1))
    for _ in range(20):
        broker.publish("t", None)
    assert hits == [20] * 500
