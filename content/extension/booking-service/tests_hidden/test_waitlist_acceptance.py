import os
import sys
from datetime import datetime

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from booking.app import create_app  # noqa: E402
from booking.errors import AlreadyWaiting, InvalidRequest, PolicyViolation, UnknownBooking  # noqa: E402
from booking.policies import Policy  # noqa: E402
from booking.reports import room_summary  # noqa: E402


class Clock:
    def __init__(self):
        self.now = datetime(2030, 6, 3, 7, 0)

    def __call__(self):
        return self.now


def at(hour, minute=0, day=4):
    return datetime(2030, 6, day, hour, minute)


def setup(policy=None):
    clock = Clock()
    service, outbox = create_app(clock, policy)
    return service, outbox, clock


def test_acceptance_joining_returns_an_entry_and_confirms_by_message():
    service, outbox, _ = setup()
    service.book("r1", "ann", at(9), at(11))
    entry = service.join_waitlist("r1", "bob", at(10), at(11))
    assert (entry.id, entry.room_id, entry.user, entry.start, entry.end) == (1, "r1", "bob", at(10), at(11))
    assert outbox.messages_for("bob") == ["Waitlisted for r1 2030-06-04 10:00-11:00."]
    assert [e.id for e in service.waitlist("r1")] == [1]


def test_acceptance_joining_follows_the_booking_rules():
    service, _, _ = setup()
    service.book("r1", "ann", at(9), at(11))
    with pytest.raises(PolicyViolation):
        service.join_waitlist("r1", "bob", at(9), at(16))
    with pytest.raises(PolicyViolation):
        service.join_waitlist("r1", "bob", at(6), at(9))


def test_acceptance_a_free_slot_cannot_be_waitlisted_and_duplicates_are_refused():
    service, _, _ = setup()
    with pytest.raises(InvalidRequest):
        service.join_waitlist("r1", "bob", at(9), at(10))
    service.book("r1", "ann", at(9), at(11))
    service.join_waitlist("r1", "bob", at(9), at(11))
    with pytest.raises(AlreadyWaiting):
        service.join_waitlist("r1", "bob", at(9), at(11))
    service.join_waitlist("r1", "bob", at(10), at(11))  # a different interval is fine


def test_acceptance_cancelling_confirms_the_first_entry_in_line():
    service, outbox, _ = setup()
    booking = service.book("r1", "ann", at(9), at(11))
    service.join_waitlist("r1", "bob", at(9), at(11))
    service.join_waitlist("r1", "cy", at(9), at(11))
    service.cancel(booking.id)
    owners = [b.user for b in service.bookings_for_room("r1")]
    assert owners == ["bob"]
    assert outbox.messages_for("bob")[-1] == "Confirmed from waitlist: r1 2030-06-04 09:00-11:00."
    assert [e.user for e in service.waitlist("r1")] == ["cy"]
    assert not any("Confirmed" in m for m in outbox.messages_for("cy"))


def test_acceptance_one_cancellation_can_confirm_several_entries():
    service, _, _ = setup()
    big = service.book("r1", "ann", at(9), at(13))
    service.join_waitlist("r1", "bob", at(9), at(10))
    service.join_waitlist("r1", "cy", at(9, 30), at(10, 30))
    service.join_waitlist("r1", "di", at(11), at(12))
    service.cancel(big.id)
    assert [(b.user, b.start.hour) for b in service.bookings_for_room("r1")] == [("bob", 9), ("di", 11)]
    assert [e.user for e in service.waitlist("r1")] == ["cy"]


def test_acceptance_entries_that_break_the_policy_stay_waiting():
    service, outbox, _ = setup(Policy(max_active=1))
    ann = service.book("r1", "ann", at(9), at(11))
    service.book("r2", "bob", at(9), at(10))
    with pytest.raises(PolicyViolation):
        service.join_waitlist("r1", "bob", at(9), at(11))  # bob is at his limit already
    service.join_waitlist("r1", "cy", at(9), at(11))
    service.cancel(ann.id)
    assert [b.user for b in service.bookings_for_room("r1")] == ["cy"]


def test_acceptance_user_limit_is_rechecked_at_confirmation_time():
    service, outbox, _ = setup(Policy(max_active=1))
    ann = service.book("r1", "ann", at(9), at(11))
    entry = service.join_waitlist("r1", "bob", at(9), at(11))
    service.book("r2", "bob", at(13), at(14))  # bob fills his only slot meanwhile
    service.cancel(ann.id)
    assert service.bookings_for_room("r1") == []
    assert [e.id for e in service.waitlist("r1")] == [entry.id]
    assert not any("Confirmed" in m for m in outbox.messages_for("bob"))


def test_acceptance_past_entries_are_dropped_silently():
    service, outbox, clock = setup()
    booking = service.book("r1", "ann", at(9), at(11))
    service.join_waitlist("r1", "bob", at(9), at(11))
    clock.now = at(9, 30)
    service.cancel(booking.id)
    assert service.waitlist("r1") == [] and service.bookings_for_room("r1") == []
    assert len(outbox.messages_for("bob")) == 1


def test_acceptance_rescheduling_frees_the_old_slot():
    service, _, _ = setup()
    booking = service.book("r1", "ann", at(9), at(11))
    service.join_waitlist("r1", "bob", at(9), at(10))
    service.reschedule(booking.id, at(12), at(14))
    assert sorted((b.user, b.start.hour) for b in service.bookings_for_room("r1")) == [("ann", 12), ("bob", 9)]
    assert service.waitlist("r1") == []


def test_acceptance_leaving_the_waitlist_and_the_summary():
    service, _, _ = setup()
    service.book("r1", "ann", at(9), at(11))
    entry = service.join_waitlist("r1", "bob", at(9), at(11))
    assert room_summary(service, "r1")["waiting"] == 1
    assert service.cancel_waitlist(entry.id) == entry
    assert room_summary(service, "r1")["waiting"] == 0
    with pytest.raises(UnknownBooking):
        service.cancel_waitlist(entry.id)


def test_regression_booking_and_cancelling_without_a_waitlist():
    service, outbox, _ = setup()
    booking = service.book("r1", "ann", at(9), at(11))
    service.cancel(booking.id)
    assert outbox.messages_for("ann") == ["Booked r1 2030-06-04 09:00-11:00.", "Cancelled r1 2030-06-04 09:00-11:00."]
    assert service.bookings_for_room("r1") == []


def test_regression_summary_keeps_its_other_fields():
    service, _, _ = setup()
    service.book("r1", "ann", at(9), at(11))
    summary = room_summary(service, "r1")
    assert (summary["bookings"], summary["hours"], summary["users"]) == (1, 2.0, ["ann"])
