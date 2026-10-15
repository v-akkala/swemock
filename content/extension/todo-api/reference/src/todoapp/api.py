import re
from dataclasses import dataclass, field

from .errors import AppError, MethodNotAllowed, NotFound
from .serializers import todo_to_dict, todos_to_list

_ITEM = re.compile(r"^/todos/(\d+)$")


@dataclass
class Request:
    method: str
    path: str
    query: dict = field(default_factory=dict)
    body: object = None


class Api:
    """Routes requests to the service and turns results and errors into (status, payload)."""

    def __init__(self, service):
        self._service = service

    def handle(self, request):
        try:
            return self._route(request)
        except AppError as error:
            payload = {"error": error.code, "message": error.message, "field": error.field}
            return error.status, payload

    def _route(self, request):
        method, path = request.method.upper(), request.path
        if path == "/todos":
            if method == "GET":
                return 200, todos_to_list(self._service.list(request.query))
            if method == "POST":
                return 201, todo_to_dict(self._service.create(request.body))
            raise MethodNotAllowed(f"{method} is not allowed on /todos")
        if path == "/tags":
            if method != "GET":
                raise MethodNotAllowed(f"{method} is not allowed on /tags")
            tags = self._service.tags()
            return 200, {"items": tags, "count": len(tags)}
        if path == "/stats":
            if method != "GET":
                raise MethodNotAllowed(f"{method} is not allowed on /stats")
            return 200, self._service.stats()
        match = _ITEM.match(path)
        if match:
            todo_id = int(match.group(1))
            if method == "GET":
                return 200, todo_to_dict(self._service.get(todo_id))
            if method == "PATCH":
                return 200, todo_to_dict(self._service.update(todo_id, request.body))
            if method == "DELETE":
                self._service.delete(todo_id)
                return 204, None
            raise MethodNotAllowed(f"{method} is not allowed on {path}")
        raise NotFound(f"no route for {path}")
