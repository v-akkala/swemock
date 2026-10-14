import pytest

from broker import Broker


class Clock:
    def __init__(self):
        self.now = 10.0

    def __call__(self):
        return self.now


def test_core_subscribers_receive_published_messages():
    broker = Broker(Clock())
    seen = []
    broker.subscribe("orders", seen.append)
    message = broker.publish("orders", {"id": 1})
    assert seen == [message]
    assert (message.id, message.topic, message.payload, message.timestamp) == (1, "orders", {"id": 1}, 10.0)


def test_core_only_matching_topics_are_delivered():
    broker = Broker(Clock())
    a, b = [], []
    broker.subscribe("a", a.append)
    broker.subscribe("b", b.append)
    broker.publish("a", 1)
    assert len(a) == 1 and b == []


def test_core_unsubscribe_stops_delivery():
    broker = Broker(Clock())
    seen = []
    sub = broker.subscribe("t", seen.append)
    broker.publish("t", 1)
    broker.unsubscribe(sub)
    broker.publish("t", 2)
    assert [m.payload for m in seen] == [1]


def test_edge_invalid_topics_are_rejected():
    broker = Broker(Clock())
    with pytest.raises(ValueError):
        broker.subscribe("", print)
    with pytest.raises(ValueError):
        broker.publish("bad topic", 1)
