from dataclasses import dataclass


@dataclass(frozen=True)
class Todo:
    id: int
    title: str
    done: bool = False
    priority: int = 3
    created_at: float = 0.0
