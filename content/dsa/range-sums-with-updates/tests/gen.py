import json
import random

rng = random.Random(44003)
tests = []


def add(kind, nums, calls):
    ops = ["LiveSums"] + [c[0] for c in calls]
    args = [[nums]] + [list(c[1:]) for c in calls]
    tests.append({"kind": kind, "input": {"ops": ops, "args": args}})


def workload(n, calls, p_update=0.4, wide=False):
    out = []
    for _ in range(calls):
        if rng.random() < p_update:
            out.append(("update", rng.randrange(n), rng.randint(-10**4, 10**4)))
        else:
            if wide:
                left = rng.randrange(max(1, n // 20))
                right = rng.randrange(n - max(1, n // 20), n)
            else:
                left, right = sorted((rng.randrange(n), rng.randrange(n)))
            out.append(("rangeSum", left, right))
    return out


def values(n, lo=-10**4, hi=10**4):
    return [rng.randint(lo, hi) for _ in range(n)]


# Edge cases
add("edge", [0], [("rangeSum", 0, 0)])
add("edge", [5], [("update", 0, -5), ("rangeSum", 0, 0), ("update", 0, 10**4), ("rangeSum", 0, 0)])
add("edge", [1, 2], [("rangeSum", 0, 1), ("update", 1, 5), ("rangeSum", 0, 1), ("rangeSum", 1, 1)])
add("edge", [10**4] * 5, [("rangeSum", 0, 4), ("update", 2, -10**4), ("rangeSum", 0, 4), ("rangeSum", 2, 2)])
add("edge", [-10**4] * 6, [("rangeSum", 1, 4), ("update", 3, 10**4), ("rangeSum", 0, 5)])
add("edge", [1, 2, 3, 4, 5, 6, 7, 8], [("rangeSum", 0, 7), ("rangeSum", 3, 3), ("update", 0, 100), ("rangeSum", 0, 0), ("rangeSum", 0, 7)])
add("edge", [3, -1, 4, 1, 5, -9, 2, 6], [("update", 4, 4), ("update", 4, 4), ("rangeSum", 2, 6), ("update", 4, -4), ("rangeSum", 2, 6)])

# Random
for n, calls in ((5, 30), (16, 80), (100, 400), (257, 600), (1000, 1000), (1023, 1000)):
    add("random", values(n), workload(n, calls))

# Stress: summing a slice on every query is far too slow here
n = 3 * 10**4
full = [("rangeSum", 0, n - 1) if rng.random() < 0.95 else ("update", rng.randrange(n), rng.randint(-10**4, 10**4)) for _ in range(3 * 10**4)]
add("stress", values(n), full)
add("stress", values(10**4), workload(10**4, 10**4, p_update=0.5, wide=True))

print(json.dumps(tests))
