# Conventions

A room-booking service. Times are naive `datetime` values; intervals are half-open `[start, end)`.

## Layers
- `slots.py` — pure interval math. `policies.py` — the booking rules, as pure checks. `models.py` — frozen dataclasses.
- `store.py` — keeps data and applies no rules. `notifier.py` — the outbox; only `service.py` may send.
- `service.py` — the use cases. It is the only module that combines the others. `reports.py` — read-only summaries.

## Rules
- Business rules (hours, duration, limits) live in `policies.py`. Anything that creates a booking must go through the same checks as `book`.
- Time comes from the injected `clock`. Never call `datetime.now()` in the library.
- Raise `BookingError` subclasses; never return `None` or flags for failures.
- Models are immutable. Use `dataclasses.replace` to change one.
- Every state change that users should hear about sends a notification through the outbox.
- Tests live in `tests/test_<module>.py` and use the fixtures in `tests/conftest.py`.
