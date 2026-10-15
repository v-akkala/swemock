from todoapp.api import Request
from todoapp.app import create_app


def call(app, method, path, query=None, body=None):
    return app.handle(Request(method, path, query or {}, body))


def test_create_and_fetch():
    app = create_app(clock=lambda: 1.0)
    status, created = call(app, "POST", "/todos", body={"title": "Write docs", "priority": 2})
    assert status == 201 and created["priority"] == 2
    assert call(app, "GET", f"/todos/{created['id']}") == (200, created)


def test_list_returns_items_and_count():
    app = create_app()
    for title in ("a", "b"):
        call(app, "POST", "/todos", body={"title": title})
    status, payload = call(app, "GET", "/todos")
    assert status == 200 and payload["count"] == 2


def test_filters_by_done_and_text():
    app = create_app()
    _, first = call(app, "POST", "/todos", body={"title": "Buy milk"})
    call(app, "POST", "/todos", body={"title": "Walk dog"})
    call(app, "PATCH", f"/todos/{first['id']}", body={"done": True})
    assert call(app, "GET", "/todos", {"done": ["true"]})[1]["count"] == 1
    assert call(app, "GET", "/todos", {"q": ["DOG"]})[1]["items"][0]["title"] == "Walk dog"


def test_errors_have_a_standard_shape():
    app = create_app()
    status, payload = call(app, "POST", "/todos", body={"title": ""})
    assert status == 422
    assert payload == {"error": "validation", "message": "title must not be empty", "field": "title"}
    assert call(app, "GET", "/todos/99")[0] == 404
    assert call(app, "PUT", "/todos")[0] == 405


def test_delete_and_stats():
    app = create_app()
    _, todo = call(app, "POST", "/todos", body={"title": "a"})
    assert call(app, "DELETE", f"/todos/{todo['id']}") == (204, None)
    assert call(app, "GET", "/stats")[1] == {"total": 0, "done": 0, "open": 0}
