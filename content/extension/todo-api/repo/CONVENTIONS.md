# Conventions

This is a small in-memory JSON API. Follow these rules; reviewers will check them.

## Layers

`api.py` (HTTP-like routing) -> `service.py` (use cases) -> `store.py` (state). Each layer only calls the one below it.
- `api.py` parses the request and shapes the response. It holds no business rules.
- `service.py` validates input (through `validation.py`), applies rules, and calls the store.
- `store.py` is the only place todos are kept. It never validates.
- `filters.py` holds list filtering; `serializers.py` is the only place todos are turned into response dicts.

## Rules

- Todos are immutable (`frozen=True`). Change one with `dataclasses.replace`, then `store.replace(...)`.
- All input validation lives in `validation.py` and raises `ValidationError(message, field)`. Never validate elsewhere.
- Errors are `AppError` subclasses with `status` and `code`; `api.py` turns them into `{"error", "message", "field"}`.
- List endpoints return `{"items": [...], "count": n}`.
- Query parameters arrive as `dict[str, list[str]]` (like `urllib.parse.parse_qs`).
- Unknown fields in a request body are rejected with a `ValidationError`.
- Every module has tests in `tests/test_<module>.py`. Add tests for what you add.
- Keep functions short and name them as verbs (`clean_title`, `apply_filters`).
