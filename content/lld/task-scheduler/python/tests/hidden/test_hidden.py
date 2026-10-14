import pytest

from scheduler import TaskScheduler


def test_core_equal_priorities_run_in_insertion_order():
    s = TaskScheduler()
    for name in ["c", "a", "b"]:
        s.add(name, 5)
    assert [s.next_task() for _ in range(3)] == ["c", "a", "b"]


def test_core_a_chain_runs_one_step_at_a_time():
    s = TaskScheduler()
    s.add("a", 1)
    s.add("b", 1, ["a"])
    s.add("c", 1, ["b"])
    for name in "abc":
        assert s.next_task() == name
        assert s.next_task() is None
        s.complete(name)


def test_core_a_task_with_two_dependencies_needs_both():
    s = TaskScheduler()
    s.add("x", 1)
    s.add("y", 1)
    s.add("z", 9, ["x", "y"])
    assert s.next_task() == "x"
    s.complete("x")
    assert s.status("z") == "waiting"
    assert s.next_task() == "y"
    s.complete("y")
    assert s.next_task() == "z"


def test_core_newly_ready_tasks_compete_by_priority():
    s = TaskScheduler()
    s.add("root", 1)
    s.add("low", 2, ["root"])
    s.add("high", 8, ["root"])
    s.add("other", 5)
    assert s.next_task() == "other"
    assert s.next_task() == "root"
    s.complete("root")
    assert s.next_task() == "high"
    assert s.next_task() == "low"


def test_core_a_running_task_is_handed_out_once():
    s = TaskScheduler()
    s.add("a", 1)
    assert s.next_task() == "a"
    assert s.next_task() is None


def test_core_depending_on_a_finished_task_is_immediately_ready():
    s = TaskScheduler()
    s.add("a", 1)
    s.next_task()
    s.complete("a")
    s.add("b", 1, ["a"])
    assert s.status("b") == "ready"


def test_core_negative_and_zero_priorities_order_correctly():
    s = TaskScheduler()
    s.add("neg", -5)
    s.add("zero", 0)
    s.add("pos", 3)
    assert [s.next_task() for _ in range(3)] == ["pos", "zero", "neg"]


def test_edge_unknown_dependency_registers_nothing():
    s = TaskScheduler()
    s.add("a", 1)
    with pytest.raises(ValueError):
        s.add("b", 1, ["a", "ghost"])
    with pytest.raises(KeyError):
        s.status("b")
    s.add("b", 1)  # the id is still free


def test_edge_complete_requires_a_running_task():
    s = TaskScheduler()
    s.add("a", 1)
    with pytest.raises(ValueError):
        s.complete("a")  # ready, not running
    with pytest.raises(ValueError):
        s.complete("nope")
    s.next_task()
    s.complete("a")
    with pytest.raises(ValueError):
        s.complete("a")


def test_edge_status_of_an_unknown_task_raises():
    with pytest.raises(KeyError):
        TaskScheduler().status("nope")


def test_edge_duplicate_dependencies_count_once():
    s = TaskScheduler()
    s.add("a", 1)
    s.add("b", 1, ["a", "a"])
    s.next_task()
    s.complete("a")
    assert s.status("b") == "ready"


def test_core_many_tasks_stay_fast_and_ordered():
    s = TaskScheduler()
    for i in range(3000):
        s.add(f"t{i}", i % 10, [f"t{i - 1}"] if i % 3 == 1 else [])
    done = 0
    while True:
        task = s.next_task()
        if task is None:
            break
        s.complete(task)
        done += 1
    assert done == 3000
