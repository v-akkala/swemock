import time

from .handlers import HandlerRegistry
from .policies import RetryPolicy
from .queue import JobQueue
from .worker import Worker


def create_app(clock=time.time, policy=None):
    """Wire a queue, a registry, and a worker; returns (queue, registry, worker)."""
    queue = JobQueue(clock, policy or RetryPolicy())
    registry = HandlerRegistry()
    return queue, registry, Worker(queue, registry)
