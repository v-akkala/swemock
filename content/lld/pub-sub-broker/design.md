# Design notes

This is the **observer** pattern with a topic index, and the interesting decisions are about *re-entrancy* and *failure*.

- **State.** An ordered collection of subscriptions (id, topic, handler), and a delivery queue. Lookup by topic can scan the list (fine for a small broker) or keep a dictionary from topic to subscription ids (O(subscribers of that topic) per publish).
- **Delivery.** `publish` appends the message to a queue; if no delivery is in progress, it drains the queue. Draining pops a message, takes a **snapshot** of the matching subscriptions, and calls each handler that is still subscribed. The snapshot gives the rule "subscribers added during delivery miss the message"; the "still subscribed" check gives "removed subscribers don't get it".
- **Order.** Because nested publishes are queued rather than delivered recursively, every subscriber sees messages in publish order and the call stack stays shallow. Recursive delivery would deliver a later message *before* the current one finished reaching everyone.
- **Failure isolation.** A `try/except Exception` around each handler call records a `Failure` and moves on; one bad subscriber cannot break the others or the publisher. Catch `Exception`, not `BaseException`.
- **Provided code.** `validate_topic` is the single place that knows what a topic is, `Message` and `Failure` are the record types. Don't duplicate them.

**What to avoid.** An abstract `Subscriber` class with one implementation, per-topic `Topic` objects with no behavior, threads and locks the spec doesn't ask for.

**The requirement change** (wildcards) changes *matching* only: subscribe with `allow_wildcards=True`, and replace "topic equals" with a segment-wise match. Keeping matching in one small function is what makes the change a few lines.
