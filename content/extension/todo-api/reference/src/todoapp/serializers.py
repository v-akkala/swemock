def todo_to_dict(todo):
    return {
        "id": todo.id,
        "title": todo.title,
        "done": todo.done,
        "priority": todo.priority,
        "tags": list(todo.tags),
        "created_at": todo.created_at,
    }


def todos_to_list(todos):
    return {"items": [todo_to_dict(t) for t in todos], "count": len(todos)}
