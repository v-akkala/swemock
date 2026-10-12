import json
import random

rng = random.Random(42002)
tests = []


def add(kind, weights, days):
    tests.append({"kind": kind, "input": {"weights": weights, "days": days}})


# Edge cases
add("edge", [1], 1)
add("edge", [500], 1)
add("edge", [1, 1, 1, 1], 4)
add("edge", [1, 1, 1, 1], 1)
add("edge", [500, 1, 500], 2)
add("edge", [1, 500, 1], 3)
add("edge", [3, 3, 3, 3, 3, 3], 2)
add("edge", [10, 10, 10, 1], 3)
add("edge", list(range(1, 11)), 5)

# Random
for n, hi, d in ((10, 20, 3), (30, 100, 7), (100, 500, 10), (400, 500, 40), (1000, 30, 100)):
    add("random", [rng.randint(1, hi) for _ in range(n)], d)
add("random", [rng.randint(1, 500) for _ in range(500)], 1)
add("random", [rng.randint(1, 500) for _ in range(500)], 499)

# Stress: the linear scan over capacities is far too slow here
n = 5 * 10**4
add("stress", [500] * n, 1)
add("stress", [rng.randint(1, 500) for _ in range(n)], 1)
add("stress", [rng.randint(1, 500) for _ in range(n)], 7)
add("stress", [rng.randint(1, 500) for _ in range(n)], 2000)

print(json.dumps(tests))
