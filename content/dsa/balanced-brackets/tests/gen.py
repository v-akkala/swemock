import json
import random

rng = random.Random(41002)
tests = []
PAIRS = ["()", "[]", "{}"]


def add(kind, s):
    tests.append({"kind": kind, "input": {"s": s}})


def balanced(pairs, fill=0.0):
    """A random balanced string with `pairs` bracket pairs and optional filler letters."""
    out, stack, opened = [], [], 0
    while opened < pairs or stack:
        if opened < pairs and (not stack or rng.random() < 0.5):
            p = rng.choice(PAIRS)
            out.append(p[0])
            stack.append(p[1])
            opened += 1
        else:
            out.append(stack.pop())
        if fill and rng.random() < fill:
            out.append(rng.choice("abc0129"))
    return "".join(out)


def corrupt(s):
    """Change one bracket so the string is (almost always) unbalanced."""
    idx = [i for i, c in enumerate(s) if c in "()[]{}"]
    i = rng.choice(idx)
    other = [c for c in "()[]{}" if c != s[i]]
    return s[:i] + rng.choice(other) + s[i + 1:]


# Edge cases
for s in ["", "a", "(", ")", "()", ")(", "([{}])", "([)]", "(((", ")))", "{[()]}[", "x(y)z", "1[2{3}4]5", "]", "{{}}{}", "(()"]:
    add("edge", s)

# Random
for pairs in (3, 8, 20, 50):
    b = balanced(pairs, fill=0.3)
    add("random", b)
    add("random", corrupt(b))
add("random", "".join(rng.choice("()[]{}ab") for _ in range(60)))
add("random", balanced(300, fill=0.1))

# Stress
n = 10**5
add("stress", "(" * n + ")" * n)
add("stress", "(" * (n - 1) + "]" + ")" * (n - 1) + ")")
add("stress", balanced(n, fill=0.0))
add("stress", "[{" * (n // 2) + "}]" * (n // 2))

print(json.dumps(tests))
