from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Booking:
    id: int
    room_id: str
    user: str
    start: datetime
    end: datetime
    created_at: datetime
