# Pub/Sub Broker

`messages.py` (file 1) defines the message types and topic validation. Implement `broker.py` (file 2): an in-process message broker where publishers send messages to **topics** and subscribers receive them through **handlers**.

## Provided (messages.py)

- `Message(id, topic, payload, timestamp)`: immutable.
- `Failure(message_id, subscription_id, error)`: a record of a handler that raised (`error` is the exception's class name).
- `validate_topic(topic, allow_wildcards=False)`: returns the topic if valid, otherwise raises `ValueError`. Topics are non-empty, dot-separated words (`orders.created`).

## API of `Broker`

- `Broker(clock)`: `clock()` returns the time in seconds, used for message timestamps.
- `subscribe(topic, handler) -> int`: registers `handler` (a callable taking a `Message`) for the topic and returns a subscription id, starting at 1 and increasing by one. An invalid topic raises `ValueError`.
- `unsubscribe(subscription_id)`: removes it. An unknown or already removed id raises `KeyError`.
- `publish(topic, payload) -> Message`: creates the message (ids start at 1 and increase by one) and delivers it **synchronously** to every handler subscribed to exactly that topic, in the order they subscribed. An invalid topic raises `ValueError`; a topic with no subscribers is fine.
- `failures() -> list[Failure]`: the handler failures so far, oldest first.

## Delivery rules

- If a handler raises, record a `Failure`, and keep delivering to the remaining subscribers. The exception never reaches the publisher.
- A subscriber added while a message is being delivered does not receive that message. A subscriber removed before its turn does not receive it.
- A handler may itself call `publish`. Such messages are **queued** and delivered after the current message has been delivered to all of its subscribers, so each subscriber sees messages in the order they were published. `publish` still returns the new message immediately.

## Notes

Keep publishers ignorant of subscribers, and the broker ignorant of what handlers do. Say what you assume.
