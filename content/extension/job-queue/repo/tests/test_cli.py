from jobq.cli import main
from jobq.queue import JobQueue


def run(queue, *argv):
    lines = []
    code = main(list(argv), queue, out=lines.append)
    return code, "\n".join(lines)


def test_stats_command(clock):
    code, text = run(JobQueue(clock), "stats")
    assert code == 0 and "queued: 0" in text


def test_waiting_command(clock):
    q = JobQueue(clock)
    q.enqueue("send", delay=3)
    code, text = run(q, "waiting")
    assert code == 0 and "send" in text


def test_bad_usage(clock):
    assert run(JobQueue(clock))[0] == 2
    assert run(JobQueue(clock), "explode")[0] == 2
