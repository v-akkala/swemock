import pytest

from booking.errors import UnknownBooking
from booking.store import BookingStore
from conftest import at


def test_add_get_remove():
    store = BookingStore()
    booking = store.add("r1", "ann", at(9), at(10), at(7, day=3))
    assert store.get(booking.id) == booking
    assert store.remove(booking.id) == booking
    with pytest.raises(UnknownBooking):
        store.get(booking.id)


def test_listing_is_ordered_by_start():
    store = BookingStore()
    store.add("r1", "ann", at(13), at(14), at(7, day=3))
    store.add("r1", "bob", at(9), at(10), at(7, day=3))
    store.add("r2", "ann", at(8), at(9), at(7, day=3))
    assert [b.user for b in store.for_room("r1")] == ["bob", "ann"]
    assert [b.room_id for b in store.for_user("ann")] == ["r2", "r1"]


def test_move_changes_times_only():
    store = BookingStore()
    booking = store.add("r1", "ann", at(9), at(10), at(7, day=3))
    moved = store.move(booking.id, at(11), at(12))
    assert (moved.start, moved.user) == (at(11), "ann")
