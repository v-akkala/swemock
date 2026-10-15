# Ticket: waitlist for booked slots

When the room you need is taken, you currently have to keep retrying. Add a waitlist: ask to be put on a queue for the slot, and get it automatically when it frees up.

**Behavior**

- `service.join_waitlist(room_id, user, start, end)` returns a new `WaitlistEntry` (frozen; fields `id, room_id, user, start, end, created_at`; ids are their own sequence from 1).
  - It applies the same rules as `book` (interval, hours, duration, not in the past, the user's active-booking limit).
  - If the slot is actually free it raises `InvalidRequest` ("book it instead"). If the same user is already waiting for exactly that room and interval it raises the new `AlreadyWaiting` (a `BookingError`).
  - A confirmation goes to the user through the outbox: `Waitlisted for <room> <YYYY-MM-DD HH:MM>-<HH:MM>.`
- `service.waitlist(room_id)` lists the room's entries in the order they joined. `service.cancel_waitlist(entry_id)` removes one and returns it (unknown ids raise `UnknownBooking`).
- When a booking is cancelled, entries for that room are considered in the order they joined. An entry is confirmed — it becomes a booking and leaves the waitlist — if its slot no longer conflicts with any booking (including ones confirmed a moment ago from the same waitlist) and the user passes the usual policy checks right now. The user is told: `Confirmed from waitlist: <room> <YYYY-MM-DD HH:MM>-<HH:MM>.` Entries that cannot be confirmed stay on the list; entries whose start time has already passed are dropped silently.
- Rescheduling a booking to another time also frees its old slot, so it triggers the same check.
- `room_summary` gains a `"waiting"` count.

Follow `CONVENTIONS.md`, and add tests.
