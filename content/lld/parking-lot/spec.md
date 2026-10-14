# Parking Lot

You are given `models.py` (file 1) with the vehicle types, the ticket and error types, and the hourly rates. Implement `parking_lot.py` (file 2): a `ParkingLot` that assigns spots, issues tickets, and charges fees.

## Provided (models.py)

- `VehicleType`: `MOTORCYCLE`, `CAR`, `TRUCK`.
- `Vehicle(plate, type)` and `Ticket(id, plate, spot_id, entered_at)`: immutable.
- Errors: `ParkingError` (base), `LotFullError`, `AlreadyParkedError`, `UnknownTicketError`.
- `hourly_rate(vehicle_type)`: the fee in cents for one hour.

You may read and even edit `models.py`, but the design review looks at whether you used what was provided instead of working around it.

## API of `ParkingLot`

- `ParkingLot(layout, clock)`: `layout` maps each `VehicleType` to the number of spots of that size (a missing type means none). `clock()` returns the current time in seconds.
- `park(vehicle) -> Ticket`: assigns a spot and returns a ticket whose ids start at 1 and increase by one per ticket.
  - A **motorcycle** fits any spot, a **car** fits a car or truck spot, a **truck** fits only a truck spot.
  - Always choose the **smallest** free spot that fits (a motorcycle takes a motorcycle spot before a car spot before a truck spot). Spot ids are `"<type>-<n>"`, numbered from 1 within each size, such as `"car-1"`. Among free spots of one size, use the lowest number.
  - Raise `LotFullError` if no spot fits, and `AlreadyParkedError` if that plate is already parked.
- `unpark(ticket_id) -> int`: frees the spot and returns the fee in cents: `hourly_rate(vehicle type)` times the number of **started** hours (at least 1). Raise `UnknownTicketError` for a ticket that doesn't exist or was already used.
- `available(vehicle_type) -> int`: how many free spots could take a vehicle of that type right now.

## Notes

The lot never reads the system clock directly. State your assumptions, and keep operations fast: they are called constantly.
