import pytest

from jobq.metrics import Metrics


def test_counters_start_at_zero_and_increment():
    m = Metrics()
    m.incr("enqueued", 2)
    assert m.snapshot()["enqueued"] == 2 and m.snapshot()["failed"] == 0


def test_unknown_metric_is_an_error():
    with pytest.raises(KeyError):
        Metrics().incr("nope")
