import json
import random

rng = random.Random(43001)
tests = []


def add(kind, coins, amount):
    tests.append({"kind": kind, "input": {"coins": coins, "amount": amount}})


# Edge cases
add("edge", [1], 0)
add("edge", [1], 1)
add("edge", [5000], 5000)
add("edge", [5000], 4999)
add("edge", [2, 4, 6], 7)
add("edge", [2, 4, 6], 12)
add("edge", [3, 7], 11)
add("edge", [3, 7], 17)
add("edge", [186, 419, 83, 408], 100)
add("edge", [1, 5, 6, 9], 11)
add("edge", [25, 10, 5, 1], 23)
add("edge", [2], 10**4)

# Random. The brute force recurses without memory, so keep the amounts it can still manage.
for coins, amount in (([1, 2, 5], 14), ([2, 5, 10], 31), ([3, 11, 13], 40), ([7, 9, 16], 60), ([4, 6, 15], 45)):
    add("random", coins, amount)
add("random", sorted(rng.sample(range(5, 60), 6)), 120)

# Stress
add("stress", [1, 2, 5, 10, 20, 50, 100, 200], 10**4)
add("stress", sorted(rng.sample(range(2, 5001), 100)), 10**4)
add("stress", [5000, 4999, 4998], 10**4 - 1)
add("stress", sorted(rng.sample(range(100, 400), 60)), 9973)

print(json.dumps(tests))
