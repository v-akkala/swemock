# Design notes

`models.py` gives the *vocabulary* (types, errors, rates). The lot's job is allocation and billing, so `ParkingLot` owns exactly two pieces of state: the free spots, and the open tickets.

- **Spots.** Per size, keep the spot numbers that are free (a min-heap or a sorted structure) so "lowest number first" is cheap. Allocation walks the sizes that can fit the vehicle from smallest to largest and takes the first free spot: best fit without a scan of every spot.
- **Tickets.** A dictionary from ticket id to the ticket (and the vehicle type), plus a set of parked plates for the duplicate check. `unpark` is a dictionary lookup.
- **Fees.** Computed at `unpark` from the ticket's `entered_at` and the injected clock, using `hourly_rate` from the provided file: `ceil(elapsed / 3600)`, minimum 1. Rates stay in `models.py`; the lot doesn't hard-code prices.
- **Errors.** The lot raises the provided exception types, so callers can catch `ParkingError` once.
- **Complexity.** `park`/`unpark` O(log n) with heaps (O(1) amortized with a free list), `available` O(sizes).

**What to avoid.** Subclassing per vehicle type, a `Spot` class hierarchy, or a `PricingStrategy` interface with one strategy. They add structure with nothing to vary yet.

**The requirement change** (passes and revenue) touches only billing: a set of pass plates consulted in `unpark`, and a running revenue total. Because fees are computed in one place, the change is a few lines.
