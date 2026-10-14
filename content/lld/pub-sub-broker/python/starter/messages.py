"""Provided code (file 1): the message types and topic validation of the broker."""

import re
from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class Message:
    id: int
    topic: str
    payload: Any
    timestamp: float


@dataclass(frozen=True)
class Failure:
    """A handler that raised: which message, which subscription, and the exception's class name."""

    message_id: int
    subscription_id: int
    error: str


Handler = Callable[[Message], None]

_WORD = re.compile(r"^[A-Za-z0-9_-]+$")


def validate_topic(topic: str, allow_wildcards: bool = False) -> str:
    """Return the topic if it is valid, otherwise raise ValueError.

    A topic is one or more non-empty words separated by dots. With allow_wildcards a word may be `*`.
    """
    if not isinstance(topic, str) or not topic:
        raise ValueError("topic must be a non-empty string")
    for word in topic.split("."):
        if allow_wildcards and word == "*":
            continue
        if not _WORD.match(word):
            raise ValueError(f"invalid topic: {topic!r}")
    return topic
