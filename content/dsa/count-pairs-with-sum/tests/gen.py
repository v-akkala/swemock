import json
import random

rng = random.Random(41001)
tests = []


def add(kind, nums, target):
    tests.append({"kind": kind, "input": {"nums": nums, "target": target}})


# Edge cases
add("edge", [1], 2)
add("edge", [1, 2], 3)
add("edge", [5, 5], 10)
add("edge", [0, 0, 0], 0)
add("edge", [10**9, 10**9], 2 * 10**9)
add("edge", [-10**9, -10**9, -10**9], -2 * 10**9)
add("edge", [3, -3, 3, -3, 0], 0)
add("edge", [7] * 1000, 14)
add("edge", [1, 2, 3, 4], 100)

# Random, with a small value range so that collisions are common
for n, span in ((10, 5), (100, 20), (700, 50), (1500, 300)):
    nums = [rng.randint(-span, span) for _ in range(n)]
    add("random", nums, rng.randint(-span, span))
nums = [rng.randint(-10**9, 10**9) for _ in range(1200)]
add("random", nums, nums[3] + nums[900])

# Stress: maximum sizes; the brute force is quadratic
add("stress", [1] * 10**5, 2)
add("stress", [rng.randint(0, 5) for _ in range(10**5)], 5)
big = [rng.randint(-10**9, 10**9) for _ in range(40000)]
add("stress", big, big[7] + big[39000])

print(json.dumps(tests))
