import type { Language, Signature } from "@swemock/shared";
import { describe, expect, it } from "vitest";
import { addSig, dsa } from "./helpers";

/** The same scenarios in each language; only the source differs. */
const SOURCES: Record<Language, Record<string, string>> = {
  python: {
    add: "class Solution:\n    def add(self, a: int, b: int) -> int:\n        print('adding', a, b)\n        return a + b\n",
    wrong: "class Solution:\n    def add(self, a: int, b: int) -> int:\n        return a - b\n",
    loop: "class Solution:\n    def add(self, a: int, b: int) -> int:\n        while True:\n            pass\n",
    memory: "class Solution:\n    def add(self, a: int, b: int) -> int:\n        x = [0] * (100 * 1024 * 1024)\n        return len(x)\n",
    raises: "class Solution:\n    def add(self, a: int, b: int) -> int:\n        raise ValueError('nope')\n",
    syntax: "class Solution:\n    def add(self, a: int, b: int) -> int\n        return a + b\n",
    crash: "import os\nclass Solution:\n    def add(self, a: int, b: int) -> int:\n        os.abort()\n",
    deep: "class Solution:\n    def add(self, a: int, b: int) -> int:\n        def f(n):\n            return 0 if n == 0 else 1 + f(n - 1)\n        return f(200000) + a + b - 200000\n",
    tree: [
      "class Solution:",
      "    def mirror(self, root: Optional[TreeNode], head: Optional[ListNode], grid: List[List[str]], xs: List[float]) -> Optional[TreeNode]:",
      "        def go(n):",
      "            if n: n.left, n.right = go(n.right), go(n.left)",
      "            return n",
      "        assert head.next.val == 2 and grid[1][0] == 'c' and isinstance(xs[0], float)",
      "        return go(root)",
      "",
    ].join("\n"),
    design: [
      "class Counter:",
      "    def __init__(self, start: int):",
      "        self.v = start",
      "    def inc(self, by: int) -> None:",
      "        self.v += by",
      "    def get(self) -> int:",
      "        return self.v",
      "    def history(self) -> List[str]:",
      "        return ['x', 'y']",
      "",
    ].join("\n"),
    pairs: "class Solution:\n    def pairs(self, n: int) -> List[List[int]]:\n        return [[n, 1], [1, n]]\n",
  },
  cpp: {
    add: "class Solution { public: int add(int a, int b) { cout << \"adding \" << a << ' ' << b << endl; return a + b; } };",
    wrong: "class Solution { public: int add(int a, int b) { return a - b; } };",
    loop: "class Solution { public: int add(int a, int b) { volatile long x = 0; while (true) x++; } };",
    memory: "class Solution { public: int add(int a, int b) { vector<char> v(400u << 20, 1); return v[a + b] + v.size() % 7; } };",
    raises: "class Solution { public: int add(int a, int b) { throw runtime_error(\"nope\"); } };",
    syntax: "class Solution { public: int add(int a, int b) { return a + ; } };",
    crash: "class Solution { public: int add(int a, int b) { int* p = nullptr; return *p + a; } };",
    deep: "class Solution { public: int f(int n) { return n == 0 ? 0 : 1 + f(n - 1); } int add(int a, int b) { return f(1000000) + a + b - 1000000; } };",
    tree: [
      "class Solution {",
      "public:",
      "    TreeNode* mirror(TreeNode* root, ListNode* head, vector<vector<char>>& grid, vector<double>& xs) {",
      "        if (head->next->val != 2 || grid[1][0] != 'c') throw logic_error(\"bad input\");",
      "        function<TreeNode*(TreeNode*)> go = [&](TreeNode* n) -> TreeNode* {",
      "            if (n) { auto l = n->left; n->left = go(n->right); n->right = go(l); }",
      "            return n;",
      "        };",
      "        return go(root);",
      "    }",
      "};",
    ].join("\n"),
    design: [
      "class Counter {",
      "    int v;",
      "public:",
      "    Counter(int start) : v(start) {}",
      "    void inc(int by) { v += by; }",
      "    int get() { return v; }",
      "    vector<string> history() { return {\"x\", \"y\"}; }",
      "};",
    ].join("\n"),
    pairs: "class Solution { public: vector<vector<int>> pairs(int n) { return {{n, 1}, {1, n}}; } };",
  },
};

const treeSig: Signature = {
  kind: "function",
  name: "mirror",
  params: [
    { name: "root", type: "TreeNode" },
    { name: "head", type: "ListNode" },
    { name: "grid", type: "char[][]" },
    { name: "xs", type: "double[]" },
  ],
  returns: "TreeNode",
};

const counterSig: Signature = {
  kind: "design",
  className: "Counter",
  constructorParams: [{ name: "start", type: "int" }],
  methods: [
    { name: "inc", params: [{ name: "by", type: "int" }], returns: "void" },
    { name: "get", params: [], returns: "int" },
    { name: "history", params: [], returns: "list<string>" },
  ],
};

const pairsSig: Signature = { kind: "function", name: "pairs", params: [{ name: "n", type: "int" }], returns: "int[][]" };

const addTests = [
  { id: "1", input: { a: 1, b: 2 }, expected: 3 },
  { id: "2", input: { a: -4, b: 4 }, expected: 0 },
];

describe.each(["python", "cpp"] as const)("DSA judge: %s", (language) => {
  const src = SOURCES[language];
  const run = (code: string, extra: object = {}) => dsa({ language, code, signature: addSig, tests: addTests, ...extra });

  it("accepts a correct solution and captures stdout per test", async () => {
    const r = await run(src.add!);
    expect(r.verdict).toBe("accepted");
    expect(r.passed).toBe(2);
    expect(r.tests[0]!.stdout).toContain("adding 1 2");
    expect(r.tests[1]!.stdout).toContain("adding -4 4");
    expect(r.tests[0]!.timeMs).not.toBeNull();
    expect(r.maxMemoryKb).toBeGreaterThan(0);
  });

  it("reports wrong answers with the actual output", async () => {
    const r = await run(src.wrong!);
    expect(r.verdict).toBe("wrong_answer");
    expect(r.tests[0]).toMatchObject({ verdict: "wrong_answer", actual: "-1" });
  });

  it("reports compile errors", async () => {
    const r = await run(src.syntax!);
    expect(r.verdict).toBe("compile_error");
    expect(r.compileOutput).toBeTruthy();
    expect(r.tests).toEqual([]);
  });

  it("enforces the time limit and recovers for the next test", async () => {
    const r = await run(src.loop!, { timeLimitMs: 500 });
    expect(r.verdict).toBe("time_limit_exceeded");
    expect(r.tests.map((t) => t.verdict)).toEqual(["time_limit_exceeded", "time_limit_exceeded"]);
  });

  it("enforces the memory limit", async () => {
    const r = await run(src.memory!, { memoryLimitMb: 64 });
    expect(r.verdict).toBe("memory_limit_exceeded");
  });

  it("reports exceptions and crashes as runtime errors", async () => {
    const raised = await run(src.raises!);
    expect(raised.verdict).toBe("runtime_error");
    expect(raised.tests[0]!.message).toContain("nope");
    const crashed = await run(src.crash!);
    expect(crashed.verdict).toBe("runtime_error");
  });

  it("supports deep recursion", async () => {
    expect((await run(src.deep!)).verdict).toBe("accepted");
  });

  it("skips remaining tests after the first failure when asked", async () => {
    const r = await run(src.wrong!, { stopOnFirstFailure: true });
    expect(r.tests.map((t) => t.verdict)).toEqual(["wrong_answer", "skipped"]);
  });

  it("returns output without a verdict for custom input", async () => {
    const r = await dsa({ language, code: src.add!, signature: addSig, tests: [{ id: "custom", input: { a: 20, b: 22 } }] });
    expect(r.verdict).toBe("ran");
    expect(r.tests[0]!.actual).toBe("42");
  });

  it("converts trees, linked lists, char grids, and doubles", async () => {
    const r = await dsa({
      language,
      code: src.tree!,
      signature: treeSig,
      tests: [
        {
          id: "t",
          input: { root: [1, 2, 3, null, 4], head: [1, 2, 3], grid: [["a", "b"], ["c", "d"]], xs: [1, 2.5] },
          expected: [1, 3, 2, null, null, 4],
        },
        { id: "empty", input: { root: [], head: [1, 2], grid: [["a"], ["c"]], xs: [0] }, expected: [] },
      ],
    });
    expect(r.tests.map((t) => [t.verdict, t.message])).toEqual([
      ["accepted", null],
      ["accepted", null],
    ]);
  });

  it("runs design problems as a sequence of operations", async () => {
    const r = await dsa({
      language,
      code: src.design!,
      signature: counterSig,
      tests: [
        {
          id: "d",
          input: { ops: ["Counter", "inc", "get", "inc", "get", "history"], args: [[5], [2], [], [-10], [], []] },
          expected: [null, null, 7, null, -3, ["x", "y"]],
        },
      ],
    });
    expect(r.verdict).toBe("accepted");
  });

  it("applies the unordered and custom checkers", async () => {
    const tests = [{ id: "u", input: { n: 3 }, expected: [[1, 3], [3, 1]] }];
    const exact = await dsa({ language, code: src.pairs!, signature: pairsSig, tests });
    expect(exact.verdict).toBe("wrong_answer");
    const unordered = await dsa({ language, code: src.pairs!, signature: pairsSig, tests, checker: { type: "unordered" } });
    expect(unordered.verdict).toBe("accepted");
    const custom = await dsa({
      language,
      code: src.pairs!,
      signature: pairsSig,
      tests,
      checker: { type: "custom", source: "def check(inp, exp, act):\n    return len(act) == inp['n'] - 1, 'length check'\n" },
    });
    expect(custom.verdict).toBe("accepted");
    expect(custom.tests[0]!.message).toBe("length check");
  });
});

describe("float checker", () => {
  it("accepts answers within tolerance", async () => {
    const sig: Signature = { kind: "function", name: "half", params: [{ name: "x", type: "double" }], returns: "double" };
    const r = await dsa({
      language: "python",
      code: "class Solution:\n    def half(self, x: float) -> float:\n        return x / 2 + 1e-9\n",
      signature: sig,
      tests: [{ id: "f", input: { x: 1 }, expected: 0.5 }],
      checker: { type: "float", tolerance: 1e-6 },
    });
    expect(r.verdict).toBe("accepted");
  });
});
