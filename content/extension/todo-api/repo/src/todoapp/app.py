import time

from .api import Api
from .service import TodoService
from .store import TodoStore


def create_app(clock=time.time):
    """Wire the layers together and return the Api."""
    return Api(TodoService(TodoStore(clock)))
