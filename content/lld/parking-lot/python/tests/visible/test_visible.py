import pytest

from models import AlreadyParkedError, LotFullError, UnknownTicketError, Vehicle, VehicleType
from parking_lot import ParkingLot


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def car(plate="CAR-1"):
    return Vehicle(plate, VehicleType.CAR)


def test_core_park_returns_a_ticket_with_a_spot():
    lot = ParkingLot({VehicleType.CAR: 2}, Clock())
    t = lot.park(car())
    assert (t.id, t.plate, t.spot_id) == (1, "CAR-1", "car-1")
    assert lot.park(car("CAR-2")).spot_id == "car-2"


def test_core_unpark_charges_by_started_hours():
    clock = Clock()
    lot = ParkingLot({VehicleType.CAR: 1}, clock)
    t = lot.park(car())
    clock.now = 3600 * 2 + 1
    assert lot.unpark(t.id) == 600  # 3 started hours at 200


def test_core_full_lot_raises():
    lot = ParkingLot({VehicleType.CAR: 1}, Clock())
    lot.park(car())
    with pytest.raises(LotFullError):
        lot.park(car("CAR-2"))


def test_edge_unknown_ticket_raises():
    with pytest.raises(UnknownTicketError):
        ParkingLot({VehicleType.CAR: 1}, Clock()).unpark(99)
