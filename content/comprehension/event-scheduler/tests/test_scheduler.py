import pytest

from cronspec import SpecError, parse
from next_run import next_after
from scheduler import Scheduler
from timeutil import to_ts, to_dt
import datetime


def ts(y, mo, d, h=0, mi=0):
    return to_ts(datetime.datetime(y, mo, d, h, mi, tzinfo=datetime.timezone.utc))


class Clock:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


def test_parse_interval_and_daily():
    assert parse("every 5m").interval == 300
    spec = parse("daily 09:30")
    assert (spec.hour, spec.minute) == (9, 30)


def test_parse_rejects_garbage():
    with pytest.raises(SpecError):
        parse("whenever")


def test_interval_fires_after_the_interval():
    assert next_after(parse("every 10m"), 1000) == 1600


def test_daily_is_today_if_still_ahead():
    now = ts(2024, 3, 5, 8, 0)
    assert next_after(parse("daily 09:30"), now) == ts(2024, 3, 5, 9, 30)


def test_daily_rolls_to_tomorrow_when_passed():
    now = ts(2024, 3, 5, 10, 0)
    assert next_after(parse("daily 09:30"), now) == ts(2024, 3, 6, 9, 30)


def test_tick_runs_due_jobs_in_order():
    clock = Clock(ts(2024, 3, 5, 12, 0))
    seen = []
    s = Scheduler(clock)
    s.add("every 5m", lambda: seen.append("a"), job_id="a")
    s.add("every 5m", lambda: seen.append("b"), job_id="b")
    clock.t += 300
    assert s.tick() == ["a", "b"]
    assert seen == ["a", "b"]


def test_paused_jobs_do_not_run():
    clock = Clock(1000)
    s = Scheduler(clock)
    s.add("every 1m", lambda: None, job_id="p")
    s.pause("p")
    clock.t += 120
    assert s.tick() == []
