from jobq.queue import JobQueue
from jobq.reports import format_errors, format_stats, last_errors, waiting_jobs


def test_stats_lists_every_state_and_counter(clock):
    q = JobQueue(clock)
    q.enqueue("a")
    text = format_stats(q.stats())
    assert "queued: 1" in text and "running: 0" in text and "enqueued: 1" in text


def test_errors_are_newest_first(clock):
    q = JobQueue(clock)
    for name in ("a", "b"):
        q.enqueue(name)
        q.fail(q.claim().id, f"{name} broke")
    assert [row[1] for row in last_errors(q)] == ["b", "a"]
    assert format_errors(JobQueue(clock)) == "no errors"


def test_waiting_jobs_are_ordered_by_run_time(clock):
    q = JobQueue(clock)
    q.enqueue("late", delay=50)
    q.enqueue("soon", delay=5)
    assert [j.name for j in waiting_jobs(q)] == ["soon", "late"]
