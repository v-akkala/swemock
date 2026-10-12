"""swemock DSA driver for Python. Usage: driver.py <solution.py> <signature.json>

Protocol: one JSON test input per stdin line; one JSON result per line on fd 3 (see agent.py).
Conversions are driven by the language-neutral signature (packages/shared/src/judge/types.ts).
"""

import json
import os
import sys
import time
import traceback

PRELUDE = """
from typing import *
from collections import *
from heapq import *
from bisect import *
from functools import *
from itertools import *
from math import *
import collections, heapq, bisect, functools, itertools, math, string, re, random, operator
"""


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


# ---- type-directed conversion ------------------------------------------------


def parse_type(s):
    s = s.replace(" ", "")
    if s.endswith("[]"):
        return ("seq", parse_type(s[:-2]))
    if s.startswith("list<") and s.endswith(">"):
        return ("seq", parse_type(s[5:-1]))
    return ("base", s)


def to_list_node(values):
    head = cur = ListNode()
    for v in values or []:
        cur.next = ListNode(v)
        cur = cur.next
    return head.next


def to_tree_node(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue, qi, i = [root], 0, 1
    while qi < len(queue) and i < len(values):
        node = queue[qi]
        qi += 1
        if values[i] is not None:
            node.left = TreeNode(values[i])
            queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            queue.append(node.right)
        i += 1
    return root


def from_json(t, v):
    if t[0] == "seq":
        return None if v is None else [from_json(t[1], x) for x in v]
    name = t[1]
    if name == "ListNode":
        return to_list_node(v)
    if name == "TreeNode":
        return to_tree_node(v)
    if name == "double" and isinstance(v, int) and not isinstance(v, bool):
        return float(v)
    return v


def list_node_to_json(node):
    out, seen = [], 0
    while node is not None:
        out.append(node.val)
        node = node.next
        seen += 1
        if seen > 10_000_000:
            raise ValueError("returned linked list has a cycle")
    return out


def tree_node_to_json(root):
    out, queue, qi = [], [root], 0
    while qi < len(queue):
        node = queue[qi]
        qi += 1
        if node is None:
            out.append(None)
            continue
        out.append(node.val)
        queue.append(node.left)
        queue.append(node.right)
        if len(queue) > 10_000_000:
            raise ValueError("returned tree is too large or has a cycle")
    while out and out[-1] is None:
        out.pop()
    return out


def to_json(t, v):
    if t[0] == "seq":
        return None if v is None else [to_json(t[1], x) for x in v]
    name = t[1]
    if name == "ListNode":
        return list_node_to_json(v)
    if name == "TreeNode":
        return tree_node_to_json(v)
    return v


# ---- protocol -------------------------------------------------------------------


def user_frames(tb):
    frames = [f for f in traceback.extract_tb(tb) if f.filename == "solution.py"]
    return "".join(traceback.format_list(frames))


def main():
    src_path, sig_path = sys.argv[1], sys.argv[2]
    sig = json.load(open(sig_path))
    out = os.fdopen(3, "w", buffering=1)

    def reply(obj):
        sys.stdout.flush()
        sys.stderr.flush()
        out.write(json.dumps(obj, separators=(",", ":"), default=lambda o: repr(o)) + "\n")

    # LeetCode-style implicit imports available to the user's code.
    ns = {"__name__": "solution", "ListNode": ListNode, "TreeNode": TreeNode}
    exec(PRELUDE, ns)

    try:
        code = compile(open(src_path, encoding="utf-8").read(), "solution.py", "exec")
    except SyntaxError as e:
        reply({"ready": False, "compileError": "".join(traceback.format_exception_only(type(e), e))})
        return
    try:
        exec(code, ns)
    except BaseException as e:  # noqa: BLE001
        reply({"ready": False, "message": f"{type(e).__name__}: {e}\n{user_frames(e.__traceback__)}"})
        return

    if sig["kind"] == "function":
        params = [(p["name"], parse_type(p["type"])) for p in sig["params"]]
        ret = parse_type(sig["returns"]) if sig["returns"] != "void" else None
        cls = ns.get("Solution")
        if cls is None or not hasattr(cls, sig["name"]):
            reply({"ready": False, "compileError": f"Expected class Solution with method {sig['name']}"})
            return
    else:
        cls = ns.get(sig["className"])
        if cls is None:
            reply({"ready": False, "compileError": f"Expected class {sig['className']}"})
            return
        ctor_params = [parse_type(p["type"]) for p in sig["constructorParams"]]
        methods = {
            m["name"]: ([parse_type(p["type"]) for p in m["params"]], None if m["returns"] == "void" else parse_type(m["returns"]))
            for m in sig["methods"]
        }

    reply({"ready": True})

    for line in sys.stdin:
        inp = json.loads(line)
        try:
            if sig["kind"] == "function":
                args = [from_json(t, inp[name]) for name, t in params]
                fn = getattr(cls(), sig["name"])
                start = time.perf_counter()
                result = fn(*args)
                elapsed = time.perf_counter() - start
                output = None if ret is None else to_json(ret, result)
            else:
                ops, all_args = inp["ops"], inp["args"]
                if not ops or ops[0] != sig["className"] or len(ops) != len(all_args):
                    raise ValueError("bad design-problem input")
                elapsed = 0.0
                start = time.perf_counter()
                obj = cls(*[from_json(t, a) for t, a in zip(ctor_params, all_args[0])])
                elapsed += time.perf_counter() - start
                output = [None]
                for op, a in zip(ops[1:], all_args[1:]):
                    ptypes, rtype = methods[op]
                    args = [from_json(t, x) for t, x in zip(ptypes, a)]
                    fn = getattr(obj, op)
                    start = time.perf_counter()
                    result = fn(*args)
                    elapsed += time.perf_counter() - start
                    output.append(None if rtype is None else to_json(rtype, result))
            reply({"ok": True, "output": output, "timeMs": elapsed * 1000})
        except MemoryError:
            reply({"ok": False, "errorType": "MemoryError", "message": "out of memory"})
        except RecursionError as e:
            reply({"ok": False, "errorType": "RecursionError", "message": str(e)})
        except BaseException as e:  # noqa: BLE001
            reply({"ok": False, "errorType": type(e).__name__, "message": f"{e}\n{user_frames(e.__traceback__)}".strip()})


if __name__ == "__main__":
    sys.setrecursionlimit(1_000_000)
    main()
