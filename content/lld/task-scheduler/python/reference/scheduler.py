import heapq
from dataclasses import dataclass
from enum import Enum
from typing import Iterable, Optional


class _State(Enum):
    WAITING = "waiting"
    READY = "ready"
    RUNNING = "running"
    DONE = "done"
    CANCELLED = "cancelled"


@dataclass
class _Task:
    priority: int
    sequence: int
    missing: int  # dependencies that are not done yet
    state: _State = _State.WAITING


class TaskScheduler:
    """Priority scheduling with dependencies: a counter per task plus a heap of ready tasks."""

    def __init__(self) -> None:
        self._tasks: dict[str, _Task] = {}
        self._dependents: dict[str, list[str]] = {}
        self._ready: list[tuple[int, int, str]] = []  # (-priority, sequence, id)
        self._sequence = 0

    def add(self, task_id: str, priority: int, depends_on: Iterable[str] = ()) -> None:
        deps = list(dict.fromkeys(depends_on))
        if task_id in self._tasks:
            raise ValueError(f"task {task_id!r} already exists")
        unknown = [d for d in deps if d not in self._tasks]
        if unknown:
            raise ValueError(f"unknown dependencies: {unknown}")
        pending = [d for d in deps if self._tasks[d].state is not _State.DONE]
        task = _Task(priority, self._sequence, len(pending))
        self._sequence += 1
        self._tasks[task_id] = task
        self._dependents[task_id] = []
        for dep in pending:
            self._dependents[dep].append(task_id)
        if task.missing == 0:
            self._make_ready(task_id, task)

    def next_task(self) -> Optional[str]:
        while self._ready:
            _, _, task_id = heapq.heappop(self._ready)
            task = self._tasks[task_id]
            if task.state is _State.READY:  # cancelled tasks are skipped lazily
                task.state = _State.RUNNING
                return task_id
        return None

    def complete(self, task_id: str) -> None:
        task = self._tasks.get(task_id)
        if task is None or task.state is not _State.RUNNING:
            raise ValueError(f"task {task_id!r} is not running")
        task.state = _State.DONE
        for dependent_id in self._dependents[task_id]:
            dependent = self._tasks[dependent_id]
            if dependent.state is not _State.WAITING:
                continue
            dependent.missing -= 1
            if dependent.missing == 0:
                self._make_ready(dependent_id, dependent)

    def status(self, task_id: str) -> str:
        return self._tasks[task_id].state.value

    def cancel(self, task_id: str) -> list[str]:
        task = self._tasks.get(task_id)
        if task is None or task.state not in (_State.WAITING, _State.READY):
            raise ValueError(f"task {task_id!r} cannot be cancelled")
        cancelled: list[str] = []
        stack = [task_id]
        while stack:
            current = stack.pop()
            record = self._tasks[current]
            if record.state is _State.CANCELLED:
                continue
            record.state = _State.CANCELLED
            cancelled.append(current)
            stack.extend(self._dependents[current])
        return sorted(cancelled, key=lambda t: self._tasks[t].sequence)

    def _make_ready(self, task_id: str, task: _Task) -> None:
        task.state = _State.READY
        heapq.heappush(self._ready, (-task.priority, task.sequence, task_id))
