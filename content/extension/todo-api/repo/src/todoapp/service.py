from dataclasses import replace

from .filters import apply_filters, parse_filters
from .validation import clean_new_todo, clean_patch


class TodoService:
    def __init__(self, store):
        self._store = store

    def create(self, body):
        return self._store.add(**clean_new_todo(body))

    def get(self, todo_id):
        return self._store.get(todo_id)

    def update(self, todo_id, body):
        patch = clean_patch(body)
        todo = self._store.get(todo_id)
        return self._store.replace(replace(todo, **patch))

    def delete(self, todo_id):
        self._store.delete(todo_id)

    def list(self, query):
        filters = parse_filters(query)
        return apply_filters(self._store.all(), filters)

    def stats(self):
        todos = self._store.all()
        done = sum(1 for t in todos if t.done)
        return {"total": len(todos), "done": done, "open": len(todos) - done}
