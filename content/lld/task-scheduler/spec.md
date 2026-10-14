# Task Scheduler

Implement a scheduler that hands out tasks in priority order, but only once the tasks they depend on are finished.

## Concepts

A task has an id (string), an integer priority (**higher runs first**; negative and zero are allowed), and the ids of the tasks it depends on. A task is in one of four states:

- `waiting`: at least one dependency isn't `done` yet.
- `ready`: all dependencies are done, and it hasn't been handed out.
- `running`: handed out by `next_task`, not yet completed.
- `done`: completed.

## API

- `add(task_id, priority, depends_on=())` registers a task. Every dependency must already be registered, otherwise raise `ValueError` (C++: `std::invalid_argument`) and register nothing. Adding an id that already exists also raises `ValueError`. A task whose dependencies are all done (or that has none) starts `ready`.
- `next_task()` returns the id of the highest-priority `ready` task and marks it `running`; ties go to the task added first. It returns `None` (C++: an empty `std::optional`) if no task is ready.
- `complete(task_id)` marks a `running` task as `done`, possibly making other tasks `ready`. Raise `ValueError` if the task is unknown or not running.
- `status(task_id)` returns one of the four state names. Raise `KeyError` (C++: `std::out_of_range`) for an unknown task.

## Expectations

`add`, `next_task`, and `complete` should be efficient even with thousands of tasks (no rescanning every task on every call).
