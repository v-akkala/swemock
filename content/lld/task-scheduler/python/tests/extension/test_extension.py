import pytest

from scheduler import TaskScheduler


def test_extension_cancel_removes_a_task_and_its_dependents():
    s = TaskScheduler()
    s.add("a", 1)
    s.add("b", 1, ["a"])
    s.add("c", 1, ["b"])
    s.add("d", 1)
    assert s.cancel("a") == ["a", "b", "c"]
    assert [s.status(t) for t in "abcd"] == ["cancelled", "cancelled", "cancelled", "ready"]
    assert s.next_task() == "d"
    assert s.next_task() is None


def test_extension_cancelled_ready_tasks_are_never_handed_out():
    s = TaskScheduler()
    s.add("top", 9)
    s.add("next", 1)
    assert s.cancel("top") == ["top"]
    assert s.next_task() == "next"


def test_extension_cancel_returns_ids_in_insertion_order():
    s = TaskScheduler()
    s.add("root", 1)
    s.add("z", 1, ["root"])
    s.add("a", 1, ["root"])
    s.add("m", 1, ["z", "a"])
    assert s.cancel("root") == ["root", "z", "a", "m"]


def test_extension_cancel_rejects_running_done_cancelled_and_unknown_tasks():
    s = TaskScheduler()
    s.add("a", 1)
    s.add("b", 1)
    s.add("c", 1)
    s.next_task()
    with pytest.raises(ValueError):
        s.cancel("a")  # running
    s.complete("a")
    with pytest.raises(ValueError):
        s.cancel("a")  # done
    s.cancel("b")
    with pytest.raises(ValueError):
        s.cancel("b")  # already cancelled
    with pytest.raises(ValueError):
        s.cancel("ghost")


def test_extension_cancelling_one_dependency_cancels_the_task_but_not_its_siblings():
    s = TaskScheduler()
    s.add("a", 1)
    s.add("b", 1)
    s.add("c", 1, ["a", "b"])
    s.cancel("a")
    assert s.status("c") == "cancelled"
    assert s.next_task() == "b"
    s.complete("b")
    assert s.next_task() is None
