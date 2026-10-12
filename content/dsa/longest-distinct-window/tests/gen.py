import json
import random
import string

rng = random.Random(41005)
tests = []


def add(kind, s, k):
    tests.append({"kind": kind, "input": {"s": s, "k": k}})


def rand_str(n, alphabet):
    return "".join(rng.choice(alphabet) for _ in range(n))


# Edge cases
add("edge", "a", 1)
add("edge", "a", 26)
add("edge", "ab", 1)
add("edge", "abc", 5)
add("edge", "aaaaa", 1)
add("edge", "abcdefghijklmnopqrstuvwxyz", 26)
add("edge", "abcdefghijklmnopqrstuvwxyz", 25)
add("edge", "abababab", 2)
add("edge", "abababab", 1)
add("edge", "zzzabczzz", 3)
add("edge", "aabbccdd", 2)

# Random, quadratic-friendly sizes
for n, alpha, k in ((20, "ab", 1), (50, "abc", 2), (300, "abcde", 3), (800, string.ascii_lowercase[:10], 4), (1500, string.ascii_lowercase, 6)):
    add("random", rand_str(n, alpha), k)
# Few distinct letters in long runs
runs = "".join(rng.choice("abcd") * rng.randint(1, 30) for _ in range(60))
add("random", runs, 2)

# Stress: the brute force is quadratic when windows are long
n = 10**5
add("stress", "a" * n, 1)
add("stress", "ab" * (n // 2), 2)
add("stress", rand_str(n, string.ascii_lowercase), 26)
add("stress", rand_str(n, "abc"), 2)
add("stress", ("x" * 40000) + rand_str(20000, string.ascii_lowercase) + ("y" * 40000), 3)

print(json.dumps(tests))
