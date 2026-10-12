import json
import random

rng = random.Random(44001)
tests = []


def add(kind, cost):
    tests.append({"kind": kind, "input": {"cost": cost}})


def matrix(n, lo=0, hi=1000):
    return [[rng.randint(lo, hi) for _ in range(n)] for _ in range(n)]


# Edge cases
add("edge", [[0]])
add("edge", [[1000]])
add("edge", [[0, 0], [0, 0]])
add("edge", [[1000, 1000], [1000, 1000]])
add("edge", [[1, 2], [3, 4]])
add("edge", [[5, 5, 5], [5, 5, 5], [5, 5, 5]])
add("edge", [[0, 1000, 1000], [1000, 0, 1000], [1000, 1000, 0]])
add("edge", [[1000, 1000, 0], [1000, 0, 1000], [0, 1000, 1000]])
add("edge", [[1, 2, 3, 4], [2, 4, 6, 8], [3, 6, 9, 12], [4, 8, 12, 16]])
add("edge", [[0] * 8 for _ in range(8)])

# Random (the brute force enumerates permutations, so keep these at n <= 8)
for n in (3, 4, 5, 6, 7, 8):
    add("random", matrix(n))
add("random", matrix(8, 0, 3))

# Stress: n! is hopeless here
for n in (11, 12, 13, 14):
    add("stress", matrix(n))
add("stress", matrix(14, 0, 2))

print(json.dumps(tests))
