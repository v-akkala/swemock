class AppError(Exception):
    """Base class for errors that become API responses."""

    status = 500
    code = "internal"

    def __init__(self, message, field=None):
        super().__init__(message)
        self.message = message
        self.field = field


class ValidationError(AppError):
    status = 422
    code = "validation"


class NotFound(AppError):
    status = 404
    code = "not_found"


class MethodNotAllowed(AppError):
    status = 405
    code = "method_not_allowed"
