import datetime

import pytest

from cronspec import SpecError, parse
from next_run import next_after
from scheduler import Scheduler
from timeutil import to_ts


def ts(y, mo, d, h=0, mi=0):
    return to_ts(datetime.datetime(y, mo, d, h, mi, tzinfo=datetime.timezone.utc))


class Clock:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


def test_bug_hour_range():
    with pytest.raises(SpecError):
        parse("daily 24:00")
    assert parse("daily 23:59").hour == 23


def test_bug_weekly_same_day():
    # 2024-03-05 is a Tuesday; at 06:00 "weekly tue 08:00" is still ahead today.
    spec = parse("weekly tue 08:00")
    assert next_after(spec, ts(2024, 3, 5, 6, 0)) == ts(2024, 3, 5, 8, 0)
    assert next_after(spec, ts(2024, 3, 5, 9, 0)) == ts(2024, 3, 12, 8, 0)


def test_bug_catch_up_storm():
    clock = Clock(ts(2024, 3, 5, 12, 0))
    s = Scheduler(clock)
    runs = []
    s.add("every 1m", lambda: runs.append(1), job_id="a")
    clock.t += 3600  # the process was asleep for an hour
    s.tick()
    assert len(runs) == 1
    assert s.jobs["a"].next_run > clock.t


def test_bug_retry_off_by_one():
    clock = Clock(1000)
    s = Scheduler(clock)
    calls = []

    def boom():
        calls.append(1)
        raise RuntimeError("no")

    s.add("every 1h", boom, job_id="r", max_retries=2, retry_delay=10)
    clock.t += 3600
    for _ in range(6):
        s.tick()
        clock.t += 10
    assert len(calls) == 3
