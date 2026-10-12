def check(inp, expected, actual):
    n = inp["n"]
    if not expected:
        # The reference found a cycle, so no order exists.
        return (actual == [], "no valid order exists, so the answer must be an empty list")
    if not isinstance(actual, list) or len(actual) != n or sorted(actual) != list(range(n)):
        return (False, "the order must list every course exactly once")
    position = {course: i for i, course in enumerate(actual)}
    for a, b in inp["prerequisites"]:
        if position[b] > position[a]:
            return (False, f"course {b} must come before course {a}")
    return (True, None)
