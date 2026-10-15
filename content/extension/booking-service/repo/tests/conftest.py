import os
import sys
from datetime import datetime

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


class FakeClock:
    def __init__(self, now):
        self.now = now

    def __call__(self):
        return self.now


@pytest.fixture
def clock():
    return FakeClock(datetime(2030, 6, 3, 7, 0))


def at(hour, minute=0, day=4):
    """A time on the day after the fixture clock's day."""
    return datetime(2030, 6, day, hour, minute)
