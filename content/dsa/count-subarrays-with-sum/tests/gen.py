import json
import random

rng = random.Random(42001)
tests = []


def add(kind, nums, k):
    tests.append({"kind": kind, "input": {"nums": nums, "k": k}})


# Edge cases
add("edge", [5], 5)
add("edge", [5], 4)
add("edge", [-5], -5)
add("edge", [0], 0)
add("edge", [1, -1, 1, -1, 1, -1], 0)
add("edge", [10**4, 10**4, 10**4], 2 * 10**4)
add("edge", [-10**4] * 4, -3 * 10**4)
add("edge", [1, 2, 3], 6)
add("edge", [1, 2, 3], 10**9)
add("edge", [2, 4, -6, 2, 4, -6], 0)

# Random, small values to force many equal prefix sums
for n, span, k in ((10, 3, 2), (50, 5, 0), (300, 4, 3), (1000, 2, 1), (1500, 10**4, 7)):
    add("random", [rng.randint(-span, span) for _ in range(n)], k)
nums = [rng.randint(-10**4, 10**4) for _ in range(1500)]
add("random", nums, sum(nums[100:900]))

# Stress
n = 10**5
add("stress", [0] * n, 0)
add("stress", [rng.randint(-3, 3) for _ in range(n)], 2)
big = [rng.randint(-10**4, 10**4) for _ in range(50000)]
add("stress", big, sum(big[1000:40000]))
add("stress", [1] * n, 5 * 10**4)

print(json.dumps(tests))
