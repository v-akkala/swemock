class TaskScheduler:
    """Hands out tasks by priority once their dependencies are done. See the spec for the contract."""

    def add(self, task_id: str, priority: int, depends_on=()) -> None:
        raise NotImplementedError

    def next_task(self):
        raise NotImplementedError

    def complete(self, task_id: str) -> None:
        raise NotImplementedError

    def status(self, task_id: str) -> str:
        raise NotImplementedError
