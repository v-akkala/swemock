import csv
import io

HEADER = ["id", "room", "user", "start", "end"]


def booking_rows(service, room_id):
    """Bookings of a room as lists of strings, in start order."""
    return [[str(b.id), b.room_id, b.user, b.start.isoformat(timespec="minutes"), b.end.isoformat(timespec="minutes")] for b in service.bookings_for_room(room_id)]


def to_csv(service, room_id):
    """A CSV document (with header) of a room's bookings."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(HEADER)
    writer.writerows(booking_rows(service, room_id))
    return buffer.getvalue()


def parse_csv(text):
    """Read a document written by `to_csv` back into dicts keyed by the header."""
    return list(csv.DictReader(io.StringIO(text)))
