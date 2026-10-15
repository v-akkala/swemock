from booking.app import create_app
from booking.reports import busiest_hour, format_summary, room_summary
from conftest import at


def test_summary_and_text(clock):
    service, _ = create_app(clock)
    service.book("r1", "ann", at(9), at(11))
    service.book("r1", "bob", at(11), at(12))
    summary = room_summary(service, "r1")
    assert summary == {"room": "r1", "bookings": 2, "hours": 3.0, "users": ["ann", "bob"], "waiting": 0}
    assert format_summary(summary) == "r1: 2 bookings, 3 hours, booked by ann, bob"


def test_busiest_hour(clock):
    service, _ = create_app(clock)
    assert busiest_hour(service, "r1") is None
    service.book("r1", "ann", at(9), at(10))
    service.book("r1", "bob", at(10), at(11))
    assert busiest_hour(service, "r1") == 9
