import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from jobq.app import create_app  # noqa: E402
from jobq.errors import InvalidState, UnknownJob  # noqa: E402
from jobq.policies import RetryPolicy  # noqa: E402
from jobq.queue import JobQueue  # noqa: E402
from jobq.reports import format_stats  # noqa: E402


class Clock:
    def __init__(self, now=1000.0):
        self.now = now

    def __call__(self):
        return self.now


class Always:
    def __init__(self, value):
        self.value = value

    def uniform(self, low, high):
        return high if self.value == "high" else low


def test_acceptance_exponential_delays_double_up_to_the_cap():
    policy = RetryPolicy(max_attempts=7, delay=5, backoff="exponential", cap=60)
    assert [policy.next_delay(n) for n in range(1, 7)] == [5, 10, 20, 40, 60, 60]


def test_acceptance_factor_is_configurable():
    policy = RetryPolicy(delay=2, backoff="exponential", factor=3)
    assert [policy.next_delay(n) for n in (1, 2, 3)] == [2, 6, 18]


def test_acceptance_jitter_uses_the_injected_rng_after_the_cap():
    assert RetryPolicy(delay=10, backoff="exponential", cap=20, jitter=0.5, rng=Always("high")).next_delay(5) == 30
    assert RetryPolicy(delay=10, backoff="exponential", cap=20, jitter=0.5, rng=Always("low")).next_delay(5) == 10


def test_acceptance_invalid_policy_arguments_raise():
    for bad in ({"backoff": "linear"}, {"factor": 0}, {"cap": -5}, {"jitter": 2}, {"jitter": -0.1}):
        with pytest.raises(ValueError):
            RetryPolicy(**bad)


def test_acceptance_queue_waits_the_backed_off_delay():
    clock = Clock()
    q = JobQueue(clock, RetryPolicy(max_attempts=4, delay=5, backoff="exponential"))
    q.enqueue("flaky")
    for expected in (5, 10, 20):
        job = q.claim()
        retried = q.fail(job.id, "boom")
        assert retried.run_at == clock.now + expected
        clock.now += expected - 1
        assert q.claim() is None
        clock.now += 1


def test_acceptance_exhausted_jobs_go_to_the_dead_letters_in_order_of_death():
    clock = Clock()
    q = JobQueue(clock, RetryPolicy(max_attempts=1))
    first = q.enqueue("one")
    second = q.enqueue("two")
    q.claim()
    q.claim()
    assert q.fail(second.id, "second gave up").state == "dead"
    clock.now += 5
    assert q.fail(first.id, "first gave up").state == "dead"
    assert [j.id for j in q.dead_letters()] == [second.id, first.id]
    assert q.get(first.id).last_error == "first gave up"


def test_acceptance_a_job_is_dead_only_after_its_last_attempt():
    clock = Clock()
    q = JobQueue(clock, RetryPolicy(max_attempts=2, delay=1))
    job = q.enqueue("a")
    q.claim()
    assert q.fail(job.id, "1").state == "queued"
    assert q.dead_letters() == []
    clock.now += 1
    q.claim()
    assert q.fail(job.id, "2").state == "dead"


def test_acceptance_requeue_revives_a_dead_job():
    clock = Clock()
    q = JobQueue(clock, RetryPolicy(max_attempts=1))
    job = q.enqueue("once")
    q.claim()
    q.fail(job.id, "dead on arrival")
    clock.now += 100
    revived = q.requeue(job.id)
    assert (revived.state, revived.attempts, revived.last_error, revived.run_at) == ("queued", 0, None, clock.now)
    assert q.dead_letters() == []
    assert q.claim().id == job.id


def test_acceptance_requeue_rejects_live_and_unknown_jobs():
    q = JobQueue(Clock(), RetryPolicy(max_attempts=1))
    job = q.enqueue("a")
    with pytest.raises(InvalidState):
        q.requeue(job.id)
    with pytest.raises(UnknownJob):
        q.requeue(99)


def test_acceptance_metrics_and_report_include_dead():
    q = JobQueue(Clock(), RetryPolicy(max_attempts=2, delay=0))
    q.enqueue("a")
    q.fail(q.claim().id, "1")
    q.fail(q.claim().id, "2")
    metrics = q.stats()["metrics"]
    assert (metrics["retried"], metrics["failed"], metrics["dead"]) == (1, 2, 1)
    text = format_stats(q.stats())
    assert "dead: 1" in text


def test_acceptance_worker_sends_failing_jobs_to_the_dead_letters():
    clock = Clock()
    queue, registry, worker = create_app(clock, RetryPolicy(max_attempts=2, delay=1, backoff="exponential"))

    @registry.register("boom")
    def boom():
        raise RuntimeError("no")

    job = queue.enqueue("boom")
    assert worker.run_once().state == "queued"
    clock.now += 1
    assert worker.run_once().state == "dead"
    assert [j.id for j in queue.dead_letters()] == [job.id]


def test_regression_fixed_policy_is_unchanged():
    policy = RetryPolicy(max_attempts=3, delay=7)
    assert [policy.next_delay(n) for n in (1, 2, 3)] == [7, 7, 7]
    assert [policy.should_retry(n) for n in (1, 2, 3)] == [True, True, False]


def test_regression_success_path_and_delayed_jobs():
    clock = Clock()
    queue, registry, worker = create_app(clock)
    seen = []

    @registry.register("hello")
    def hello(name):
        seen.append(name)

    queue.enqueue("hello", {"name": "later"}, delay=30)
    assert worker.run_once() is None
    clock.now += 30
    assert worker.run_once().state == "done"
    assert seen == ["later"]
    assert queue.stats()["metrics"]["completed"] == 1


def test_regression_illegal_transitions_still_raise():
    q = JobQueue(Clock())
    job = q.enqueue("a")
    with pytest.raises(InvalidState):
        q.complete(job.id)
