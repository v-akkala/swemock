import time

from .errors import NotFound
from .models import Todo


class TodoStore:
    """Keeps todos in memory. It trusts its callers: validation happens in the service layer."""

    def __init__(self, clock=time.time):
        self._clock = clock
        self._items = {}
        self._next_id = 1

    def add(self, **fields):
        todo = Todo(id=self._next_id, created_at=self._clock(), **fields)
        self._items[todo.id] = todo
        self._next_id += 1
        return todo

    def get(self, todo_id):
        try:
            return self._items[todo_id]
        except KeyError:
            raise NotFound(f"todo {todo_id} does not exist") from None

    def replace(self, todo):
        self.get(todo.id)
        self._items[todo.id] = todo
        return todo

    def delete(self, todo_id):
        self.get(todo_id)
        del self._items[todo_id]

    def all(self):
        return [self._items[i] for i in sorted(self._items)]
