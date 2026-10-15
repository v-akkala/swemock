from datetime import datetime, timedelta

from .slots import hours_between


def free_slots(service, room_id, day, policy, min_minutes=30):
    """Free [start, end) gaps in the room's opening hours on `day`, at least `min_minutes` long."""
    opens = datetime(day.year, day.month, day.day, policy.open_hour)
    closes = datetime(day.year, day.month, day.day, policy.close_hour)
    cursor = opens
    gaps = []
    for booking in service.bookings_for_room(room_id):
        if booking.start.date() != day:
            continue
        if booking.start - cursor >= timedelta(minutes=min_minutes):
            gaps.append((cursor, booking.start))
        cursor = max(cursor, booking.end)
    if closes - cursor >= timedelta(minutes=min_minutes):
        gaps.append((cursor, closes))
    return gaps


def format_agenda(service, room_id, day):
    """A text agenda of the room's bookings on `day`, one line each."""
    lines = [f"{room_id} on {day.isoformat()}"]
    for booking in service.bookings_for_room(room_id):
        if booking.start.date() == day:
            lines.append(f"  {booking.start:%H:%M}-{booking.end:%H:%M} {booking.user} ({hours_between(booking.start, booking.end):g}h)")
    if len(lines) == 1:
        lines.append("  no bookings")
    return "\n".join(lines)


def longest_free_slot(service, room_id, day, policy):
    """The longest free gap on `day`, or None when the room is full."""
    gaps = free_slots(service, room_id, day, policy, min_minutes=1)
    if not gaps:
        return None
    return max(gaps, key=lambda gap: (gap[1] - gap[0], -gap[0].timestamp()))
