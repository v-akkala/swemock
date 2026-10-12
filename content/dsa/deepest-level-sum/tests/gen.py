import json
import random

rng = random.Random(41004)
tests = []


def add(kind, root):
    tests.append({"kind": kind, "input": {"root": root}})


def serialize(left, right, vals):
    """Level-order list with nulls, trailing nulls trimmed. Node 0 is the root."""
    out, queue, qi = [], [0], 0
    while qi < len(queue):
        i = queue[qi]
        qi += 1
        if i is None:
            out.append(None)
            continue
        out.append(vals[i])
        queue.append(left[i])
        queue.append(right[i])
    while out and out[-1] is None:
        out.pop()
    return out


def random_tree(n, lo=-10**4, hi=10**4, lean=None):
    """Attach each new node to a random free child slot. `lean` biases toward one side to deepen the tree."""
    vals = [rng.randint(lo, hi) for _ in range(n)]
    left, right = [None] * n, [None] * n
    slots = [(0, "l"), (0, "r")]
    for i in range(1, n):
        if lean == "deep":
            k = len(slots) - 1 - rng.randint(0, min(3, len(slots) - 1))
        else:
            k = rng.randrange(len(slots))
        parent, side = slots.pop(k)
        if side == "l":
            left[parent] = i
        else:
            right[parent] = i
        slots += [(i, "l"), (i, "r")]
    return serialize(left, right, vals)


def chain(n, side):
    vals = [rng.randint(-10**4, 10**4) for _ in range(n)]
    left, right = [None] * n, [None] * n
    for i in range(n - 1):
        (left if side == "l" else right)[i] = i + 1
    return serialize(left, right, vals)


def complete(n):
    vals = [rng.randint(-10**4, 10**4) for _ in range(n)]
    left = [2 * i + 1 if 2 * i + 1 < n else None for i in range(n)]
    right = [2 * i + 2 if 2 * i + 2 < n else None for i in range(n)]
    return serialize(left, right, vals)


# Edge cases
add("edge", [])
add("edge", [5])
add("edge", [-3])
add("edge", [1, 2, 3])
add("edge", [1, None, 2, None, 3])
add("edge", [1, 2, None, 3, None, 4])
add("edge", [10, -10, 10, 5, 5, 5, 5])
add("edge", [0, 1, 2, 3, None, None, 4, 5, None, None, 6])

# Random
for n in (7, 20, 100, 1000):
    add("random", random_tree(n))
add("random", random_tree(300, lean="deep"))
add("random", complete(255))

# Stress
add("stress", chain(5 * 10**4, "r"))
add("stress", chain(3 * 10**4, "l"))
add("stress", random_tree(5 * 10**4, -9, 9))
add("stress", complete(5 * 10**4))
add("stress", random_tree(2 * 10**4, -9, 9, lean="deep"))

print(json.dumps(tests))
