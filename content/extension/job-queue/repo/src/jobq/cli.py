from .reports import format_errors, format_stats, waiting_jobs

USAGE = "usage: jobq (stats | errors | waiting)"


def main(argv, queue, out=print):
    """Run one command against `queue`, writing lines with `out`; returns an exit code."""
    if len(argv) != 1:
        out(USAGE)
        return 2
    command = argv[0]
    if command == "stats":
        out(format_stats(queue.stats()))
    elif command == "errors":
        out(format_errors(queue))
    elif command == "waiting":
        for job in waiting_jobs(queue):
            out(f"#{job.id} {job.name} at {job.run_at}")
    else:
        out(USAGE)
        return 2
    return 0
