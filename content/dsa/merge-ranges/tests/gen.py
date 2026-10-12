import json
import random

rng = random.Random(42003)
tests = []


def add(kind, ranges):
    tests.append({"kind": kind, "input": {"ranges": ranges}})


def rand_ranges(n, span, max_len):
    out = []
    for _ in range(n):
        s = rng.randint(0, span)
        out.append([s, min(10**7, s + rng.randint(0, max_len))])
    return out


# Edge cases
add("edge", [[5, 5]])
add("edge", [[0, 0], [0, 0]])
add("edge", [[1, 2], [3, 4]])
add("edge", [[1, 3], [3, 5]])
add("edge", [[3, 5], [1, 3]])
add("edge", [[1, 100], [2, 3], [50, 60], [99, 101]])
add("edge", [[0, 10**7], [5, 5]])
add("edge", [[10**7, 10**7], [0, 0]])
add("edge", [[1, 4], [0, 4]])
add("edge", [[2, 3], [4, 5], [6, 7], [1, 10]])

# Random: sparse, dense, and mixed
add("random", rand_ranges(8, 30, 5))
add("random", rand_ranges(60, 1000, 20))
add("random", rand_ranges(300, 100000, 50))
add("random", rand_ranges(1000, 100, 10))
add("random", rand_ranges(900, 10**7, 3000))

# Stress: the pairwise merge is quadratic
add("stress", rand_ranges(2 * 10**4, 10**5, 50))
add("stress", [[2 * i, 2 * i] for i in reversed(range(2 * 10**4))])
add("stress", [[i, i + 1] for i in range(2 * 10**4)])
add("stress", rand_ranges(2 * 10**4, 10**6, 5))

print(json.dumps(tests))
