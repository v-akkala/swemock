from .errors import UnknownHandler


class HandlerRegistry:
    """Maps job names to the functions that run them."""

    def __init__(self):
        self._handlers = {}

    def register(self, name):
        """Decorator: register the function as the handler for `name`."""

        def wrap(func):
            self._handlers[name] = func
            return func

        return wrap

    def get(self, name):
        """The handler for `name`."""
        try:
            return self._handlers[name]
        except KeyError:
            raise UnknownHandler(f"no handler for {name}") from None
