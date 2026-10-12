import json
import random

rng = random.Random(44002)
tests = []


def add(kind, heights):
    tests.append({"kind": kind, "input": {"heights": heights}})


# Edge cases
add("edge", [0])
add("edge", [7])
add("edge", [10**4])
add("edge", [0, 0, 0])
add("edge", [1, 2, 3, 4, 5])
add("edge", [5, 4, 3, 2, 1])
add("edge", [3, 3, 3, 3])
add("edge", [2, 1, 2])
add("edge", [6, 2, 5, 4, 5, 1, 6])
add("edge", [1, 0, 1, 0, 1])
add("edge", [10**4] * 20)
add("edge", [9, 0, 9, 9, 0, 9, 9, 9])

# Random (the brute force is quadratic, so keep these moderate)
for n, hi in ((10, 5), (50, 20), (200, 100), (800, 10**4), (1500, 10)):
    add("random", [rng.randint(0, hi) for _ in range(n)])

# Stress
n = 5 * 10**4
add("stress", [rng.randint(0, 10**4) for _ in range(n)])
add("stress", list(range(1, n + 1)))
add("stress", [10**4] * n)
add("stress", [rng.choice([1, 10**4]) for _ in range(n)])
add("stress", [(i % 200) * 50 for i in range(n)])

print(json.dumps(tests))
