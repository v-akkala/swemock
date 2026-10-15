from .slots import hours_between


def room_summary(service, room_id):
    """Counts and booked hours for a room."""
    bookings = service.bookings_for_room(room_id)
    return {
        "room": room_id,
        "bookings": len(bookings),
        "hours": sum(hours_between(b.start, b.end) for b in bookings),
        "users": sorted({b.user for b in bookings}),
    }


def format_summary(summary):
    """One-paragraph text for a room summary."""
    users = ", ".join(summary["users"]) or "nobody"
    return f"{summary['room']}: {summary['bookings']} bookings, {summary['hours']:g} hours, booked by {users}"


def busiest_hour(service, room_id):
    """The hour of day (0-23) with the most bookings starting, or None for an empty room."""
    counts = {}
    for booking in service.bookings_for_room(room_id):
        counts[booking.start.hour] = counts.get(booking.start.hour, 0) + 1
    if not counts:
        return None
    return sorted(counts, key=lambda hour: (-counts[hour], hour))[0]
