from .models import STATES


def format_stats(stats):
    """A multi-line text summary: one line per job state, then one per counter."""
    lines = [f"{state}: {stats['states'].get(state, 0)}" for state in STATES]
    lines += [f"{name}: {value}" for name, value in sorted(stats["metrics"].items())]
    return "\n".join(lines)


def last_errors(queue, limit=5):
    """The most recent errors as (job id, job name, message), newest job first."""
    jobs = [j for j in queue.store.all() if j.last_error]
    return [(j.id, j.name, j.last_error) for j in reversed(jobs)][:limit]


def format_errors(queue, limit=5):
    """One line per recent error, or a note when there are none."""
    rows = last_errors(queue, limit)
    if not rows:
        return "no errors"
    return "\n".join(f"#{job_id} {name}: {message}" for job_id, name, message in rows)


def waiting_jobs(queue):
    """Queued jobs ordered by when they will run."""
    waiting = [j for j in queue.store.all() if j.state == "queued"]
    return sorted(waiting, key=lambda j: (j.run_at, j.id))
