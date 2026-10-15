# Conventions

A small in-process job queue. Rules for every change:

## Structure
- `models.py` — immutable data (`Job` is a frozen dataclass). Change one with `dataclasses.replace`.
- `transitions.py` — the only place that knows which state changes are legal. Every state change goes through `check(old, new)`.
- `store.py` — keeps jobs; no rules. `queue.py` — the use cases and all rules. `worker.py` — runs handlers.
- `policies.py` — retry/backoff decisions as pure functions of their inputs. No clock reads and no randomness inside a policy unless it is passed in.
- `metrics.py` — counters. Update them from `queue.py` only.

## Rules
- Time comes from the injected `clock` callable. Never call `time.time()` outside `app.py`.
- Raise `JobError` subclasses from `errors.py`; never return error codes or `None` for failures.
- New job states go into `models.py` *and* `transitions.py`.
- Public methods have a one-line docstring saying what they return.
- Tests live in `tests/test_<module>.py` and use the `FakeClock` from `tests/conftest.py`.
