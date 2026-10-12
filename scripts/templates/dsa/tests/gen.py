"""Hidden test generator. Prints one JSON array to stdout: [{"kind": ..., "input": {...}}, ...].

Rules
  * Fixed seed: the same script must always print the same tests (content:validate reruns it).
  * Inputs only. Expected outputs are computed from solutions/reference.py by `pnpm content:gen`.
  * At least 15 tests, including "edge" (smallest/degenerate cases), "random", and "stress" (maximum size).
  * Python standard library only. Keep the whole output under ~5 MB.
"""
import json
import random

rng = random.Random(20260101)
tests = []


def add(kind, nums):
    tests.append({"kind": kind, "input": {"nums": nums}})


# Edge cases
add("edge", [1, 2])
add("edge", [-1000000000, -1000000000])
add("edge", [1000000000, 1000000000, 1000000000])
add("edge", [0, 0])
add("edge", [7, 7, 7, 7])
add("edge", [-5, 3, -5, 3])
add("edge", [10, -10])

# Random, small to medium
for n in (3, 5, 10, 50, 200, 1000):
    add("random", [rng.randint(-1000, 1000) for _ in range(n)])
for n in (100, 5000):
    add("random", [rng.randint(-10**9, 10**9) for _ in range(n)])

# Stress: maximum size
add("stress", [rng.randint(-10**9, 10**9) for _ in range(10**5)])
add("stress", list(range(10**5)))
add("stress", [10**9] * 10**5)

print(json.dumps(tests))
