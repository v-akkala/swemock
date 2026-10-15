# Ticket: exponential backoff and a dead-letter queue

Retrying a failing job every 10 seconds hammers whatever is down, and jobs that give up simply vanish into a `failed` state nobody looks at. Fix both.

**Backoff**

- `RetryPolicy(max_attempts=3, delay=10, backoff="fixed", factor=2, cap=None, jitter=0.0, rng=None)`.
- `backoff="fixed"` (the default) behaves exactly as today.
- `backoff="exponential"`: after the n-th failed try, `next_delay(n)` is `delay * factor ** (n - 1)`, limited to `cap` when a cap is set. So `delay=5, cap=60` gives 5, 10, 20, 40, 60, 60...
- `jitter` is a fraction between 0 and 1. The delay is multiplied by `1 + rng.uniform(-jitter, jitter)`, after the cap is applied. `rng` is any object with `uniform(a, b)`; it defaults to a new `random.Random()`. With `jitter=0` nothing random happens.
- Invalid values (an unknown `backoff`, `factor < 1`, a non-positive `cap`, `jitter` outside 0..1) raise `ValueError`, like the existing arguments do.

**Dead letters**

- A job that has used all its attempts now ends in the new state `dead` instead of `failed`. The `failed` state is removed.
- `queue.dead_letters()` returns the dead jobs in the order they died.
- `queue.requeue(job_id)` moves a dead job back to `queued`, with its attempts reset to 0, its `last_error` cleared, and `run_at` set to now. Requeuing a job that is not dead raises `InvalidState`; an unknown id raises `UnknownJob`.
- Metrics: `failed` now counts every failed try (including ones that will be retried); the new `dead` counter counts jobs that reached the dead-letter state; `retried` is unchanged.
- The text report (`format_stats`) shows the `dead` state and counter like the others.

Update existing tests that encode the old behavior, and add tests for the new. Follow `CONVENTIONS.md`.
