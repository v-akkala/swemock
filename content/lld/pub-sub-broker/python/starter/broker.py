from messages import Failure, Handler, Message


class Broker:
    """An in-process pub/sub broker. See the spec for the contract."""

    def __init__(self, clock) -> None:
        raise NotImplementedError

    def subscribe(self, topic: str, handler: Handler) -> int:
        """Register a handler for the topic and return its subscription id."""
        raise NotImplementedError

    def unsubscribe(self, subscription_id: int) -> None:
        raise NotImplementedError

    def publish(self, topic: str, payload) -> Message:
        """Create the message and deliver it to the subscribers."""
        raise NotImplementedError

    def failures(self) -> list[Failure]:
        raise NotImplementedError
