class BookingError(Exception):
    """Base class for booking errors."""


class SlotTaken(BookingError):
    """The room is already booked for part of that time."""


class PolicyViolation(BookingError):
    """The request breaks a booking rule."""


class UnknownBooking(BookingError):
    """No booking has this id."""


class AlreadyWaiting(BookingError):
    """The user is already waiting for this slot."""


class InvalidRequest(BookingError):
    """The request does not make sense."""
