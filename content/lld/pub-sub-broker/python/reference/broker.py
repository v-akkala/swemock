from collections import deque
from dataclasses import dataclass

from messages import Failure, Handler, Message, validate_topic


@dataclass
class _Subscription:
    id: int
    topic: str
    handler: Handler


def _matches(pattern: str, topic: str) -> bool:
    """Segment-wise match: `*` stands for exactly one segment."""
    pattern_words, topic_words = pattern.split("."), topic.split(".")
    return len(pattern_words) == len(topic_words) and all(p == "*" or p == t for p, t in zip(pattern_words, topic_words))


class Broker:
    """An in-process pub/sub broker: synchronous, ordered, and isolated from failing handlers."""

    def __init__(self, clock) -> None:
        self._clock = clock
        self._subscriptions: dict[int, _Subscription] = {}  # insertion order = subscription order
        self._queue: deque[Message] = deque()
        self._failures: list[Failure] = []
        self._next_subscription = 1
        self._next_message = 1
        self._delivering = False

    def subscribe(self, topic: str, handler: Handler) -> int:
        validate_topic(topic, allow_wildcards=True)
        subscription = _Subscription(self._next_subscription, topic, handler)
        self._next_subscription += 1
        self._subscriptions[subscription.id] = subscription
        return subscription.id

    def unsubscribe(self, subscription_id: int) -> None:
        if subscription_id not in self._subscriptions:
            raise KeyError(subscription_id)
        del self._subscriptions[subscription_id]

    def publish(self, topic: str, payload) -> Message:
        validate_topic(topic)
        message = Message(self._next_message, topic, payload, self._clock())
        self._next_message += 1
        self._queue.append(message)
        if not self._delivering:
            self._drain()
        return message

    def failures(self) -> list[Failure]:
        return list(self._failures)

    # -- internals ---------------------------------------------------------------------------------

    def _drain(self) -> None:
        self._delivering = True
        try:
            while self._queue:
                self._deliver(self._queue.popleft())
        finally:
            self._delivering = False

    def _deliver(self, message: Message) -> None:
        snapshot = [s for s in self._subscriptions.values() if _matches(s.topic, message.topic)]
        for subscription in snapshot:
            if subscription.id not in self._subscriptions:
                continue  # unsubscribed before its turn
            try:
                subscription.handler(message)
            except Exception as error:  # a failing handler must not affect the others
                self._failures.append(Failure(message.id, subscription.id, type(error).__name__))
