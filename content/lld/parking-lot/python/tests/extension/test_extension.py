from models import Vehicle, VehicleType
from parking_lot import ParkingLot

C = VehicleType.CAR


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def test_extension_pass_holders_park_free():
    clock = Clock()
    lot = ParkingLot({C: 2}, clock)
    lot.add_pass("vip")
    t = lot.park(Vehicle("vip", C))
    clock.now += 5 * 3600
    assert lot.unpark(t.id) == 0


def test_extension_a_pass_added_while_parked_applies_at_unpark():
    clock = Clock()
    lot = ParkingLot({C: 2}, clock)
    t = lot.park(Vehicle("late", C))
    lot.add_pass("late")
    clock.now += 3600
    assert lot.unpark(t.id) == 0


def test_extension_revenue_is_the_sum_of_fees_charged():
    clock = Clock()
    lot = ParkingLot({C: 3}, clock)
    lot.add_pass("vip")
    a = lot.park(Vehicle("a", C))
    b = lot.park(Vehicle("b", C))
    v = lot.park(Vehicle("vip", C))
    clock.now += 3600
    lot.unpark(a.id)
    clock.now += 3600
    lot.unpark(b.id)
    lot.unpark(v.id)
    assert lot.revenue() == 200 + 400


def test_extension_revenue_starts_at_zero_and_only_counts_completed_stays():
    lot = ParkingLot({C: 1}, Clock())
    assert lot.revenue() == 0
    lot.park(Vehicle("a", C))
    assert lot.revenue() == 0
