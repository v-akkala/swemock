import json
import random

rng = random.Random(42004)
tests = []


def add(kind, n, prereqs):
    tests.append({"kind": kind, "input": {"n": n, "prerequisites": prereqs}})


def random_dag(n, m):
    """Edges respect a random hidden order, so the graph is acyclic. Returns distinct [a, b] pairs."""
    order = list(range(n))
    rng.shuffle(order)
    edges = set()
    while len(edges) < m and n > 1:
        i, j = sorted(rng.sample(range(n), 2))
        edges.add((order[j], order[i]))  # order[j] depends on order[i]
    return [list(e) for e in sorted(edges)]


def with_cycle(n, edges):
    """Add a back edge that closes a cycle through an existing path, if possible."""
    if not edges:
        return edges + [[0, 0]]
    a, b = edges[rng.randrange(len(edges))]
    extra = [b, a]
    return edges + [extra] if extra not in edges else edges


# Edge cases
add("edge", 1, [])
add("edge", 1, [[0, 0]])
add("edge", 2, [[1, 0]])
add("edge", 2, [[0, 1]])
add("edge", 2, [[0, 1], [1, 0]])
add("edge", 3, [[0, 1], [1, 2], [2, 0]])
add("edge", 5, [])
add("edge", 4, [[1, 0], [2, 1], [3, 2]])
add("edge", 4, [[0, 1], [1, 2], [2, 3]])
add("edge", 6, [[1, 0], [2, 0], [3, 1], [3, 2], [4, 3], [5, 4], [2, 5]])

# Random
for n, m in ((8, 10), (30, 60), (200, 500), (1000, 3000)):
    e = random_dag(n, m)
    add("random", n, e)
    add("random", n, with_cycle(n, e))

# Stress
n = 10**4
add("stress", n, [[i + 1, i] for i in range(n - 1)])
add("stress", n, [[i, i + 1] for i in range(n - 1)])
dag = random_dag(n, 3 * 10**4)
add("stress", n, dag)
add("stress", n, with_cycle(n, dag))
add("stress", n, [[v, 0] for v in range(1, n)])

print(json.dumps(tests))
