import heapq

from models import (
    SIZE_ORDER,
    AlreadyParkedError,
    LotFullError,
    Ticket,
    UnknownTicketError,
    Vehicle,
    VehicleType,
    hourly_rate,
    started_hours,
)


class ParkingLot:
    """Assigns spots (best fit), issues tickets, and charges fees (with monthly passes)."""

    def __init__(self, layout: dict, clock) -> None:
        self._clock = clock
        # Per size, a min-heap of free spot numbers: the lowest number is always handed out first.
        self._free = {t: list(range(1, layout.get(t, 0) + 1)) for t in SIZE_ORDER}
        for heap in self._free.values():
            heapq.heapify(heap)
        self._open: dict[int, tuple[Ticket, VehicleType, VehicleType, int]] = {}
        self._parked: set[str] = set()
        self._passes: set[str] = set()
        self._next_id = 1
        self._revenue = 0

    def park(self, vehicle: Vehicle) -> Ticket:
        if vehicle.plate in self._parked:
            raise AlreadyParkedError(vehicle.plate)
        for size in self._sizes_that_fit(vehicle.type):
            if self._free[size]:
                number = heapq.heappop(self._free[size])
                ticket = Ticket(self._next_id, vehicle.plate, f"{size.value}-{number}", self._clock())
                self._next_id += 1
                self._open[ticket.id] = (ticket, vehicle.type, size, number)
                self._parked.add(vehicle.plate)
                return ticket
        raise LotFullError(vehicle.type.value)

    def unpark(self, ticket_id: int) -> int:
        entry = self._open.pop(ticket_id, None)
        if entry is None:
            raise UnknownTicketError(ticket_id)
        ticket, vehicle_type, size, number = entry
        heapq.heappush(self._free[size], number)
        self._parked.discard(ticket.plate)
        if ticket.plate in self._passes:
            return 0
        fee = hourly_rate(vehicle_type) * started_hours(self._clock() - ticket.entered_at)
        self._revenue += fee
        return fee

    def available(self, vehicle_type: VehicleType) -> int:
        return sum(len(self._free[size]) for size in self._sizes_that_fit(vehicle_type))

    def add_pass(self, plate: str) -> None:
        self._passes.add(plate)

    def revenue(self) -> int:
        return self._revenue

    @staticmethod
    def _sizes_that_fit(vehicle_type: VehicleType) -> list[VehicleType]:
        return SIZE_ORDER[SIZE_ORDER.index(vehicle_type) :]
