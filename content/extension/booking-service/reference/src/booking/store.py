from dataclasses import replace

from .errors import UnknownBooking
from .models import Booking, WaitlistEntry


class BookingStore:
    """Keeps bookings. It applies no rules."""

    def __init__(self):
        self._bookings = {}
        self._next_id = 1
        self._waiting = {}
        self._next_waiting_id = 1

    def add(self, room_id, user, start, end, created_at):
        """Store and return a new booking."""
        booking = Booking(self._next_id, room_id, user, start, end, created_at)
        self._bookings[booking.id] = booking
        self._next_id += 1
        return booking

    def get(self, booking_id):
        try:
            return self._bookings[booking_id]
        except KeyError:
            raise UnknownBooking(f"no booking with id {booking_id}") from None

    def remove(self, booking_id):
        """Delete and return a booking."""
        booking = self.get(booking_id)
        del self._bookings[booking_id]
        return booking

    def move(self, booking_id, start, end):
        """Change a booking's times; returns the updated booking."""
        booking = replace(self.get(booking_id), start=start, end=end)
        self._bookings[booking_id] = booking
        return booking

    def for_room(self, room_id):
        """Bookings in a room ordered by start time."""
        found = [b for b in self._bookings.values() if b.room_id == room_id]
        return sorted(found, key=lambda b: (b.start, b.id))

    def add_waiting(self, room_id, user, start, end, created_at):
        """Store and return a new waitlist entry."""
        entry = WaitlistEntry(self._next_waiting_id, room_id, user, start, end, created_at)
        self._waiting[entry.id] = entry
        self._next_waiting_id += 1
        return entry

    def remove_waiting(self, entry_id):
        """Delete and return a waitlist entry."""
        try:
            return self._waiting.pop(entry_id)
        except KeyError:
            raise UnknownBooking(f"no waitlist entry with id {entry_id}") from None

    def waiting_for_room(self, room_id):
        """Waitlist entries of a room in the order they joined."""
        return sorted((w for w in self._waiting.values() if w.room_id == room_id), key=lambda w: w.id)

    def for_user(self, user):
        """Bookings of a user ordered by start time."""
        found = [b for b in self._bookings.values() if b.user == user]
        return sorted(found, key=lambda b: (b.start, b.id))
