from datetime import datetime

from .notifier import Outbox
from .policies import Policy
from .service import BookingService
from .store import BookingStore


def create_app(clock=datetime.now, policy=None):
    """Wire the layers; returns (service, outbox)."""
    outbox = Outbox()
    return BookingService(BookingStore(), policy or Policy(), outbox, clock), outbox
