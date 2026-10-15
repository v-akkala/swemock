from . import policies
from .errors import SlotTaken
from .slots import overlaps


class BookingService:
    def __init__(self, store, policy, outbox, clock):
        self._store = store
        self._policy = policy
        self._outbox = outbox
        self._clock = clock

    def _active(self, user):
        now = self._clock()
        return [b for b in self._store.for_user(user) if b.end > now]

    def _conflicts(self, room_id, start, end):
        return [b for b in self._store.for_room(room_id) if overlaps(start, end, b.start, b.end)]

    def book(self, room_id, user, start, end):
        """Create a booking; raises SlotTaken or PolicyViolation."""
        policies.check(self._policy, self._active(user), start, end, self._clock())
        if self._conflicts(room_id, start, end):
            raise SlotTaken(f"{room_id} is already booked between {start:%H:%M} and {end:%H:%M}")
        booking = self._store.add(room_id, user, start, end, self._clock())
        self._outbox.send(user, f"Booked {room_id} {start:%Y-%m-%d %H:%M}-{end:%H:%M}.")
        return booking

    def cancel(self, booking_id):
        """Cancel a booking; returns it."""
        booking = self._store.remove(booking_id)
        self._outbox.send(booking.user, f"Cancelled {booking.room_id} {booking.start:%Y-%m-%d %H:%M}-{booking.end:%H:%M}.")
        return booking

    def get(self, booking_id):
        """The booking with this id."""
        return self._store.get(booking_id)

    def bookings_for_room(self, room_id):
        """Bookings in a room ordered by start time."""
        return self._store.for_room(room_id)

    def bookings_for_user(self, user):
        """Active bookings of a user ordered by start time."""
        return self._active(user)

    def reschedule(self, booking_id, start, end):
        """Move a booking to another time in the same room; returns it."""
        booking = self._store.get(booking_id)
        others = [a for a in self._active(booking.user) if a.id != booking_id]
        policies.check(self._policy, others, start, end, self._clock())
        if [c for c in self._conflicts(booking.room_id, start, end) if c.id != booking_id]:
            raise SlotTaken(f"{booking.room_id} is already booked between {start:%H:%M} and {end:%H:%M}")
        moved = self._store.move(booking_id, start, end)
        self._outbox.send(booking.user, f"Moved {booking.room_id} to {start:%Y-%m-%d %H:%M}-{end:%H:%M}.")
        return moved
