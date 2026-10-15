import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from todoapp.api import Request  # noqa: E402
from todoapp.app import create_app  # noqa: E402


def call(app, method, path, query=None, body=None):
    return app.handle(Request(method, path, query or {}, body))


def make():
    app = create_app()
    call(app, "POST", "/todos", body={"title": "Ship release", "tags": ["Work", "urgent"]})
    call(app, "POST", "/todos", body={"title": "Water plants", "tags": ["home"]})
    call(app, "POST", "/todos", body={"title": "Write report", "tags": ["work"]})
    call(app, "POST", "/todos", body={"title": "No tags"})
    return app


def test_acceptance_tags_are_normalized_and_deduplicated():
    status, todo = call(create_app(), "POST", "/todos", body={"title": "a", "tags": [" Work", "urgent", "WORK"]})
    assert status == 201
    assert todo["tags"] == ["work", "urgent"]


def test_acceptance_untagged_todos_have_an_empty_list():
    status, todo = call(create_app(), "POST", "/todos", body={"title": "a"})
    assert todo["tags"] == []


def test_acceptance_invalid_tags_are_validation_errors():
    app = create_app()
    for bad in (["a", "b", "c", "d", "e", "f"], ["has space"], ["x" * 21], "work", [5], [""], ["Ünï"]):
        status, payload = call(app, "POST", "/todos", body={"title": "a", "tags": bad})
        assert status == 422, bad
        assert payload["error"] == "validation" and payload["field"] == "tags", bad


def test_acceptance_six_tags_that_collapse_to_five_are_fine():
    status, todo = call(create_app(), "POST", "/todos", body={"title": "a", "tags": ["a", "b", "c", "d", "e", "A"]})
    assert status == 201 and len(todo["tags"]) == 5


def test_acceptance_filter_by_one_tag_is_case_insensitive():
    status, payload = call(make(), "GET", "/todos", {"tag": ["WORK"]})
    assert status == 200
    assert [t["title"] for t in payload["items"]] == ["Ship release", "Write report"]
    assert payload["count"] == 2


def test_acceptance_repeated_tag_filters_require_all_tags():
    _, payload = call(make(), "GET", "/todos", {"tag": ["work", "urgent"]})
    assert [t["title"] for t in payload["items"]] == ["Ship release"]


def test_acceptance_unknown_tag_gives_an_empty_list():
    status, payload = call(make(), "GET", "/todos", {"tag": ["nothing"]})
    assert status == 200 and payload == {"items": [], "count": 0}


def test_acceptance_tag_filter_combines_with_other_filters():
    app = make()
    call(app, "PATCH", "/todos/1", body={"done": True})
    _, payload = call(app, "GET", "/todos", {"tag": ["work"], "done": ["false"]})
    assert [t["title"] for t in payload["items"]] == ["Write report"]


def test_acceptance_patch_replaces_tags():
    app = make()
    status, todo = call(app, "PATCH", "/todos/1", body={"tags": ["Later"]})
    assert status == 200 and todo["tags"] == ["later"]
    _, cleared = call(app, "PATCH", "/todos/1", body={"tags": []})
    assert cleared["tags"] == []
    assert call(app, "PATCH", "/todos/1", body={"tags": ["bad tag"]})[0] == 422


def test_acceptance_tags_endpoint_ranks_by_use_then_name():
    status, payload = call(make(), "GET", "/tags")
    assert status == 200
    assert payload["items"] == [{"tag": "work", "count": 2}, {"tag": "home", "count": 1}, {"tag": "urgent", "count": 1}]
    assert payload["count"] == 3


def test_acceptance_tags_endpoint_follows_deletes():
    app = make()
    call(app, "DELETE", "/todos/2")
    tags = [i["tag"] for i in call(app, "GET", "/tags")[1]["items"]]
    assert "home" not in tags


def test_regression_unknown_fields_are_still_rejected():
    status, payload = call(create_app(), "POST", "/todos", body={"title": "a", "colour": "red"})
    assert status == 422 and payload["field"] == "colour"


def test_regression_existing_filters_still_work():
    app = make()
    call(app, "PATCH", "/todos/2", body={"done": True})
    assert call(app, "GET", "/todos", {"done": ["true"]})[1]["count"] == 1
    assert call(app, "GET", "/todos", {"q": ["REPORT"]})[1]["count"] == 1
    assert call(app, "GET", "/todos", {"done": ["true", "false"]})[0] == 422


def test_regression_stats_and_errors_are_unchanged():
    app = make()
    assert call(app, "GET", "/stats")[1] == {"total": 4, "done": 0, "open": 4}
    assert call(app, "GET", "/todos/99")[0] == 404
    assert call(app, "DELETE", "/tags")[0] == 405
