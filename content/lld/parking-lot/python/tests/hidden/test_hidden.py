import pytest

from models import AlreadyParkedError, LotFullError, UnknownTicketError, Vehicle, VehicleType
from parking_lot import ParkingLot

M, C, T = VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.TRUCK


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_core_smallest_fitting_spot_is_used_first():
    lot = ParkingLot({M: 1, C: 1, T: 1}, Clock())
    assert lot.park(Vehicle("m1", M)).spot_id == "motorcycle-1"
    assert lot.park(Vehicle("m2", M)).spot_id == "car-1"
    assert lot.park(Vehicle("m3", M)).spot_id == "truck-1"


def test_core_trucks_only_fit_truck_spots():
    lot = ParkingLot({M: 2, C: 2, T: 1}, Clock())
    assert lot.park(Vehicle("t1", T)).spot_id == "truck-1"
    with pytest.raises(LotFullError):
        lot.park(Vehicle("t2", T))


def test_core_cars_can_overflow_into_truck_spots():
    lot = ParkingLot({C: 1, T: 1}, Clock())
    lot.park(Vehicle("a", C))
    assert lot.park(Vehicle("b", C)).spot_id == "truck-1"
    with pytest.raises(LotFullError):
        lot.park(Vehicle("c", C))


def test_core_a_freed_spot_is_reused_lowest_number_first():
    lot = ParkingLot({C: 3}, Clock())
    tickets = [lot.park(Vehicle(f"p{i}", C)) for i in range(3)]
    lot.unpark(tickets[2].id)
    lot.unpark(tickets[0].id)
    assert lot.park(Vehicle("x", C)).spot_id == "car-1"
    assert lot.park(Vehicle("y", C)).spot_id == "car-3"


def test_core_fee_rounds_up_and_has_a_one_hour_minimum():
    clock = Clock()
    lot = ParkingLot({M: 1, T: 1}, clock)
    a = lot.park(Vehicle("m", M))
    clock.now += 1
    assert lot.unpark(a.id) == 100
    b = lot.park(Vehicle("t", T))
    clock.now += 3600
    assert lot.unpark(b.id) == 400
    c = lot.park(Vehicle("t", T))
    clock.now += 3601
    assert lot.unpark(c.id) == 800


def test_core_fee_uses_the_vehicle_type_not_the_spot_size():
    clock = Clock()
    lot = ParkingLot({T: 1}, clock)
    t = lot.park(Vehicle("small", M))
    clock.now += 10
    assert lot.unpark(t.id) == 100


def test_core_available_counts_every_spot_that_fits():
    lot = ParkingLot({M: 2, C: 3, T: 1}, Clock())
    assert (lot.available(M), lot.available(C), lot.available(T)) == (6, 4, 1)
    lot.park(Vehicle("a", C))
    assert (lot.available(M), lot.available(C), lot.available(T)) == (5, 3, 1)


def test_core_ticket_ids_increase():
    lot = ParkingLot({C: 5}, Clock())
    assert [lot.park(Vehicle(f"p{i}", C)).id for i in range(3)] == [1, 2, 3]


def test_edge_same_plate_cannot_park_twice_until_it_leaves():
    lot = ParkingLot({C: 3}, Clock())
    t = lot.park(Vehicle("same", C))
    with pytest.raises(AlreadyParkedError):
        lot.park(Vehicle("same", C))
    lot.unpark(t.id)
    lot.park(Vehicle("same", C))


def test_edge_a_ticket_can_only_be_used_once():
    lot = ParkingLot({C: 1}, Clock())
    t = lot.park(Vehicle("a", C))
    lot.unpark(t.id)
    with pytest.raises(UnknownTicketError):
        lot.unpark(t.id)


def test_edge_missing_sizes_mean_no_spots():
    lot = ParkingLot({C: 1}, Clock())
    assert lot.available(T) == 0
    with pytest.raises(LotFullError):
        lot.park(Vehicle("t", T))


def test_core_busy_day():
    clock = Clock()
    lot = ParkingLot({M: 50, C: 100, T: 20}, clock)
    open_tickets = []
    kinds = [M] * 50 + [C] * 100 + [T] * 20
    for i, kind in enumerate(kinds):
        open_tickets.append(lot.park(Vehicle(f"p{i}", kind)))
    assert lot.available(M) == 0
    for t in open_tickets:
        clock.now += 60
        assert lot.unpark(t.id) > 0
    assert lot.available(M) == 170
