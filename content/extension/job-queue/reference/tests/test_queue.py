import pytest

from jobq.errors import InvalidState, UnknownJob
from jobq.policies import RetryPolicy
from jobq.queue import JobQueue


def test_enqueue_and_claim_in_order(clock):
    q = JobQueue(clock)
    a, b = q.enqueue("a"), q.enqueue("b")
    assert q.claim().id == a.id
    assert q.claim().id == b.id
    assert q.claim() is None


def test_delayed_jobs_wait_for_their_time(clock):
    q = JobQueue(clock)
    q.enqueue("later", delay=30)
    assert q.claim() is None
    clock.advance(30)
    assert q.claim().name == "later"


def test_complete_counts_and_changes_state(clock):
    q = JobQueue(clock)
    q.enqueue("a")
    job = q.claim()
    assert q.complete(job.id).state == "done"
    assert q.stats()["metrics"]["completed"] == 1


def test_failures_are_retried_after_the_delay_then_fail(clock):
    q = JobQueue(clock, RetryPolicy(max_attempts=2, delay=5))
    q.enqueue("flaky")
    job = q.claim()
    retried = q.fail(job.id, "boom")
    assert retried.state == "queued" and retried.run_at == clock() + 5
    assert q.claim() is None
    clock.advance(5)
    job = q.claim()
    final = q.fail(job.id, "boom again")
    assert final.state == "dead" and final.last_error == "boom again"
    metrics = q.stats()["metrics"]
    assert (metrics["retried"], metrics["failed"], metrics["dead"]) == (1, 2, 1)


def test_unknown_jobs_and_bad_transitions(clock):
    q = JobQueue(clock)
    with pytest.raises(UnknownJob):
        q.get(99)
    job = q.enqueue("a")
    with pytest.raises(InvalidState):
        q.complete(job.id)
