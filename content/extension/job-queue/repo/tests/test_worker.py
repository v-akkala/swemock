from jobq.app import create_app
from jobq.policies import RetryPolicy


def test_worker_runs_handlers_with_payload(clock):
    queue, registry, worker = create_app(clock)
    seen = []

    @registry.register("greet")
    def greet(name):
        seen.append(name)

    queue.enqueue("greet", {"name": "Ada"})
    assert worker.run_until_idle() == 1
    assert seen == ["Ada"]


def test_failing_handler_is_retried(clock):
    queue, registry, worker = create_app(clock, RetryPolicy(max_attempts=2, delay=1))

    @registry.register("boom")
    def boom():
        raise RuntimeError("nope")

    job = queue.enqueue("boom")
    assert worker.run_once().state == "queued"
    clock.advance(1)
    assert worker.run_once().state == "failed"
    assert "RuntimeError: nope" in queue.get(job.id).last_error


def test_unknown_handler_counts_as_a_failed_try(clock):
    queue, _, worker = create_app(clock, RetryPolicy(max_attempts=1))
    queue.enqueue("mystery")
    assert worker.run_once().state == "failed"
