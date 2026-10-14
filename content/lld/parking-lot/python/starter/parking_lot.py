from models import Ticket, Vehicle, VehicleType


class ParkingLot:
    """Assigns spots, issues tickets, and charges fees. See the spec for the contract."""

    def __init__(self, layout: dict, clock) -> None:
        """`layout` maps each VehicleType to its number of spots; `clock()` returns seconds."""
        raise NotImplementedError

    def park(self, vehicle: Vehicle) -> Ticket:
        """Park the vehicle in the smallest free spot that fits and return its ticket."""
        raise NotImplementedError

    def unpark(self, ticket_id: int) -> int:
        """Free the spot and return the fee in cents."""
        raise NotImplementedError

    def available(self, vehicle_type: VehicleType) -> int:
        """How many free spots could take a vehicle of this type right now."""
        raise NotImplementedError
