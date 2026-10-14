"""Provided code (file 1): the vocabulary of the parking system. Read it before you design."""

import math
from dataclasses import dataclass
from enum import Enum


class VehicleType(Enum):
    MOTORCYCLE = "motorcycle"
    CAR = "car"
    TRUCK = "truck"


# Spot sizes in increasing order: a vehicle fits any spot at least as large as itself.
SIZE_ORDER = [VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.TRUCK]


@dataclass(frozen=True)
class Vehicle:
    plate: str
    type: VehicleType


@dataclass(frozen=True)
class Ticket:
    id: int
    plate: str
    spot_id: str
    entered_at: float


class ParkingError(Exception):
    """Base class for every error the parking system raises."""


class LotFullError(ParkingError):
    """No free spot can take this vehicle."""


class AlreadyParkedError(ParkingError):
    """That plate is already parked in the lot."""


class UnknownTicketError(ParkingError):
    """The ticket doesn't exist, or was already used."""


_RATES_CENTS = {VehicleType.MOTORCYCLE: 100, VehicleType.CAR: 200, VehicleType.TRUCK: 400}


def hourly_rate(vehicle_type: VehicleType) -> int:
    """The fee in cents for one started hour."""
    return _RATES_CENTS[vehicle_type]


def started_hours(seconds: float) -> int:
    """Billing hours: every started hour counts, and the minimum is one."""
    return max(1, math.ceil(seconds / 3600))
