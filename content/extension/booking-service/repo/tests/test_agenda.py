from booking.agenda import format_agenda, free_slots, longest_free_slot
from booking.app import create_app
from booking.policies import Policy
from conftest import at

DAY = at(0).date()


def test_free_slots_around_bookings(clock):
    service, _ = create_app(clock)
    service.book("r1", "ann", at(9), at(11))
    service.book("r1", "bob", at(11, 15), at(12))
    gaps = free_slots(service, "r1", DAY, Policy())
    assert [(s.hour, e.hour) for s, e in gaps] == [(8, 9), (12, 20)]
    assert gaps[0][0] == at(8)


def test_short_gaps_are_ignored(clock):
    service, _ = create_app(clock)
    service.book("r1", "ann", at(9), at(11))
    service.book("r1", "bob", at(11, 15), at(12))
    assert all(s != at(11) for s, _ in free_slots(service, "r1", DAY, Policy()))
    assert (at(11), at(11, 15)) in free_slots(service, "r1", DAY, Policy(), min_minutes=10)


def test_agenda_text(clock):
    service, _ = create_app(clock)
    assert format_agenda(service, "r1", DAY).splitlines() == ["r1 on 2030-06-04", "  no bookings"]
    service.book("r1", "ann", at(9), at(10, 30))
    assert format_agenda(service, "r1", DAY).splitlines()[-1] == "  09:00-10:30 ann (1.5h)"


def test_longest_free_slot(clock):
    service, _ = create_app(clock)
    service.book("r1", "ann", at(8), at(10))
    assert longest_free_slot(service, "r1", DAY, Policy()) == (at(10), at(20))
