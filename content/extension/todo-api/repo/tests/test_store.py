import pytest

from todoapp.errors import NotFound
from todoapp.store import TodoStore


def test_add_assigns_sequential_ids_and_timestamps():
    store = TodoStore(clock=lambda: 42.0)
    a, b = store.add(title="a"), store.add(title="b")
    assert (a.id, b.id, a.created_at) == (1, 2, 42.0)


def test_get_and_delete():
    store = TodoStore()
    todo = store.add(title="a")
    assert store.get(todo.id) == todo
    store.delete(todo.id)
    with pytest.raises(NotFound):
        store.get(todo.id)


def test_all_is_ordered_by_id():
    store = TodoStore()
    for title in "abc":
        store.add(title=title)
    assert [t.title for t in store.all()] == ["a", "b", "c"]
