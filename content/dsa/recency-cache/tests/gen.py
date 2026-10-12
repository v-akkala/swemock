import json
import random

rng = random.Random(43002)
tests = []


def add(kind, capacity, calls):
    ops = ["RecencyCache"] + [c[0] for c in calls]
    args = [[capacity]] + [list(c[1:]) for c in calls]
    tests.append({"kind": kind, "input": {"ops": ops, "args": args}})


def workload(n, keys, p_get, values=10**5):
    calls = []
    for _ in range(n):
        if rng.random() < p_get:
            calls.append(("get", rng.randint(0, keys)))
        else:
            calls.append(("put", rng.randint(0, keys), rng.randint(0, values)))
    return calls


# Edge cases
add("edge", 1, [("get", 3)])
add("edge", 1, [("put", 1, 1), ("put", 2, 2), ("get", 1), ("get", 2)])
add("edge", 1, [("put", 1, 1), ("put", 1, 5), ("get", 1)])
add("edge", 2, [("put", 0, 0), ("put", 1, 1), ("get", 0), ("put", 2, 2), ("get", 1), ("get", 0), ("get", 2)])
add("edge", 3, [("put", 1, 1), ("put", 2, 2), ("put", 3, 3), ("put", 1, 10), ("put", 4, 4), ("get", 2), ("get", 1), ("get", 3), ("get", 4)])
add("edge", 2, [("put", 10**6, 10**5), ("get", 10**6), ("get", 0)])
add("edge", 5, [("put", k, k) for k in range(5)] + [("get", 0), ("put", 5, 5), ("get", 1), ("get", 0)])
add("edge", 10, [("put", 1, 1), ("get", 1), ("get", 1), ("put", 2, 2), ("get", 2)])

# Random
add("random", 2, workload(30, 4, 0.5))
add("random", 5, workload(100, 9, 0.5))
add("random", 20, workload(400, 30, 0.6))
add("random", 50, workload(800, 100, 0.4))
add("random", 10, workload(500, 10, 0.5))
add("random", 100, workload(600, 80, 0.5))

# Stress: a scan-based cache is far too slow here
# Fill the cache first so that every later call has to search a full cache.
add("stress", 10**4, [("put", i, i) for i in range(10**4)] + workload(4 * 10**4, 9999, 0.5))
add("stress", 3000, [("put", i, i) for i in range(3000)] + workload(12000, 4000, 0.5))

print(json.dumps(tests))
