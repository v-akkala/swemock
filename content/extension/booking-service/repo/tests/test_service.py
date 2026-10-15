import pytest

from booking.app import create_app
from booking.errors import PolicyViolation, SlotTaken, UnknownBooking
from conftest import at


def test_book_and_notify(clock):
    service, outbox = create_app(clock)
    booking = service.book("r1", "ann", at(9), at(11))
    assert service.get(booking.id) == booking
    assert outbox.messages_for("ann") == ["Booked r1 2030-06-04 09:00-11:00."]


def test_overlapping_bookings_are_refused_but_adjacent_ones_are_fine(clock):
    service, _ = create_app(clock)
    service.book("r1", "ann", at(9), at(11))
    with pytest.raises(SlotTaken):
        service.book("r1", "bob", at(10), at(12))
    service.book("r1", "bob", at(11), at(12))
    service.book("r2", "bob", at(9), at(11))


def test_policy_is_enforced(clock):
    service, _ = create_app(clock)
    with pytest.raises(PolicyViolation):
        service.book("r1", "ann", at(9), at(15))


def test_cancel_frees_the_slot(clock):
    service, outbox = create_app(clock)
    booking = service.book("r1", "ann", at(9), at(11))
    service.cancel(booking.id)
    service.book("r1", "bob", at(9), at(11))
    assert outbox.messages_for("ann")[-1] == "Cancelled r1 2030-06-04 09:00-11:00."
    with pytest.raises(UnknownBooking):
        service.cancel(booking.id)


def test_reschedule(clock):
    service, _ = create_app(clock)
    booking = service.book("r1", "ann", at(9), at(10))
    service.book("r1", "bob", at(12), at(13))
    assert service.reschedule(booking.id, at(9, 30), at(10, 30)).start == at(9, 30)
    with pytest.raises(SlotTaken):
        service.reschedule(booking.id, at(12), at(13))


def test_user_limit_counts_only_active_bookings(clock):
    service, _ = create_app(clock)
    for hour in (8, 10, 12):
        service.book("r1", "ann", at(hour), at(hour + 1))
    with pytest.raises(PolicyViolation):
        service.book("r1", "ann", at(14), at(15))
    clock.now = at(13)
    service.book("r1", "ann", at(15), at(16))
