import json
import random

rng = random.Random(41003)
tests = []


def add(kind, a, b):
    tests.append({"kind": kind, "input": {"a": a, "b": b}})


def sorted_list(n, lo=-10**4, hi=10**4):
    return sorted(rng.randint(lo, hi) for _ in range(n))


# Edge cases
add("edge", [], [])
add("edge", [], [1])
add("edge", [1], [])
add("edge", [1], [1])
add("edge", [2], [1])
add("edge", [1, 2, 3], [4, 5, 6])
add("edge", [4, 5, 6], [1, 2, 3])
add("edge", [-10**4] * 5, [10**4] * 5)
add("edge", [1, 1, 1], [1, 1])
add("edge", [1, 3, 5, 7], [2, 4, 6, 8])

# Random
for na, nb in ((5, 8), (30, 30), (100, 3), (3, 100), (1000, 1200)):
    add("random", sorted_list(na), sorted_list(nb))
add("random", sorted_list(500, -5, 5), sorted_list(500, -5, 5))

# Stress
add("stress", sorted_list(5 * 10**4, -99, 99), sorted_list(5 * 10**4, -99, 99))
add("stress", sorted_list(5 * 10**4, 0, 10), [])
add("stress", list(range(-10**4, 10**4 + 1)), list(range(-10**4, 10**4 + 1)))

print(json.dumps(tests))
