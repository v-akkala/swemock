import pytest

from scheduler import TaskScheduler


def test_core_highest_priority_runs_first():
    s = TaskScheduler()
    s.add("low", 1)
    s.add("high", 9)
    s.add("mid", 5)
    assert [s.next_task(), s.next_task(), s.next_task()] == ["high", "mid", "low"]
    assert s.next_task() is None


def test_core_a_task_waits_for_its_dependencies():
    s = TaskScheduler()
    s.add("a", 1)
    s.add("b", 100, ["a"])
    assert s.status("b") == "waiting"
    assert s.next_task() == "a"
    assert s.next_task() is None  # b is still waiting for a to complete
    s.complete("a")
    assert s.status("b") == "ready"
    assert s.next_task() == "b"


def test_core_status_follows_the_lifecycle():
    s = TaskScheduler()
    s.add("a", 1)
    assert s.status("a") == "ready"
    s.next_task()
    assert s.status("a") == "running"
    s.complete("a")
    assert s.status("a") == "done"


def test_edge_duplicate_ids_are_rejected():
    s = TaskScheduler()
    s.add("a", 1)
    with pytest.raises(ValueError):
        s.add("a", 2)
