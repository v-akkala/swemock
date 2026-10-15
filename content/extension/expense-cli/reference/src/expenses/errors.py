class ExpenseError(Exception):
    """Base class for errors shown to the user."""


class InvalidAmount(ExpenseError):
    pass


class InvalidDate(ExpenseError):
    pass


class InvalidRule(ExpenseError):
    pass


class UnknownExpense(ExpenseError):
    pass


class StorageError(ExpenseError):
    pass
