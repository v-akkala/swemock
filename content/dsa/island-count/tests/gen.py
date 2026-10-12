import json
import random

rng = random.Random(42005)
tests = []


def add(kind, grid):
    tests.append({"kind": kind, "input": {"grid": [list(row) for row in grid]}})


def rand_grid(rows, cols, p_land):
    return ["".join("1" if rng.random() < p_land else "0" for _ in range(cols)) for _ in range(rows)]


def snake(rows, cols):
    """One long winding island: full land rows joined by a single connector cell at alternating ends."""
    grid = [["0"] * cols for _ in range(rows)]
    for r in range(0, rows, 2):
        grid[r] = ["1"] * cols
    for r in range(1, rows, 2):
        grid[r][cols - 1 if (r // 2) % 2 == 0 else 0] = "1"
    return ["".join(row) for row in grid]


# Edge cases
add("edge", ["0"])
add("edge", ["1"])
add("edge", ["1", "0", "1"])
add("edge", ["101"])
add("edge", ["111", "111", "111"])
add("edge", ["000", "000", "000"])
add("edge", ["1010", "0101", "1010"])
add("edge", ["11011", "11011", "00100", "11011"])
add("edge", ["1" * 300])
add("edge", ["1"] * 300)
add("edge", ["10001", "01010", "00100", "01010", "10001"])

# Random
for rows, cols, p in ((5, 5, 0.4), (10, 20, 0.5), (30, 30, 0.3), (50, 40, 0.6), (100, 100, 0.55)):
    add("random", rand_grid(rows, cols, p))

# Stress
add("stress", rand_grid(300, 300, 0.58))
add("stress", ["".join("1" if (r + c) % 2 == 0 else "0" for c in range(300)) for r in range(300)])
add("stress", snake(299, 300))
add("stress", rand_grid(100, 300, 0.3))

print(json.dumps(tests))
