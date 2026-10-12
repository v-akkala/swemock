import { describe, expect, it } from "vitest";
import { project } from "./helpers";

describe("project runs", () => {
  it("runs pytest and parses JUnit results with categories", async () => {
    const r = await project({
      language: "python",
      files: {
        "calc.py": "def add(a, b):\n    return a + b\n",
        "tests/test_calc.py": [
          "from calc import add",
          "def test_core_add():\n    assert add(1, 2) == 3",
          "def test_edge_negative():\n    assert add(-1, -1) == -3",
          "",
        ].join("\n"),
      },
      command: { kind: "shell", cmd: "python3 -m pytest -q -p no:cacheprovider --junitxml=.results/junit.xml tests" },
      results: { format: "junit", path: ".results/junit.xml" },
      categories: [{ pattern: "edge", category: "edge" }],
    });
    expect(r.exitCode).toBe(1);
    expect(r.tests).toHaveLength(2);
    const byName = Object.fromEntries(r.tests!.map((t) => [t.name, t]));
    expect(byName.test_core_add).toMatchObject({ status: "passed", category: "core" });
    expect(byName.test_edge_negative).toMatchObject({ status: "failed", category: "edge" });
    expect(byName.test_edge_negative!.message).toContain("assert");
  });

  it("builds and runs doctest suites with JUnit output", async () => {
    const r = await project({
      language: "cpp",
      files: {
        "lib.hpp": "inline int twice(int x) { return 2 * x; }\n",
        "tests.cpp": [
          "#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN",
          '#include "doctest.h"',
          '#include "lib.hpp"',
          'TEST_CASE("core: twice") { CHECK(twice(2) == 4); }',
          'TEST_CASE("edge: zero") { CHECK(twice(0) == 1); }',
          "",
        ].join("\n"),
      },
      command: {
        kind: "shell",
        cmd: "g++ -std=c++20 -O2 -I/sandbox/cpp -o tests tests.cpp && ./tests -r=junit -o=results.xml",
      },
      results: { format: "junit", path: "results.xml" },
      categories: [{ pattern: "edge", category: "edge" }],
    });
    expect(r.tests?.map((t) => [t.name, t.status, t.category])).toEqual([
      ["core: twice", "passed", "core"],
      ["edge: zero", "failed", "edge"],
    ]);
  });

  it("runs the current file in each language", async () => {
    const py = await project({
      language: "python",
      files: { "src/main.py": "import sys\nprint('hi', sys.stdin.read().strip())\n" },
      command: { kind: "runFile", path: "src/main.py" },
      stdin: "there",
    });
    expect(py).toMatchObject({ exitCode: 0, stdout: "hi there\n", tests: null });

    const cpp = await project({
      language: "cpp",
      files: { "main.cpp": "#include <iostream>\nint main() { std::cout << \"cpp ok\\n\"; return 3; }\n" },
      command: { kind: "runFile", path: "main.cpp" },
    });
    expect(cpp).toMatchObject({ exitCode: 3, stdout: "cpp ok\n" });
  });

  it("times out long-running commands and caps output", async () => {
    const r = await project({
      language: "python",
      files: { "spin.py": "while True:\n    print('x' * 1000)\n" },
      command: { kind: "runFile", path: "spin.py" },
      timeoutMs: 2000,
    });
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBeNull();
    expect(r.stdoutTruncated).toBe(true);
    expect(r.stdout.length).toBeLessThan(70 * 1024);
  });

  it("reports a missing results file without failing the run", async () => {
    const r = await project({
      language: "python",
      files: { "a.py": "" },
      command: { kind: "shell", cmd: "true" },
      results: { format: "junit", path: "nope.xml" },
    });
    expect(r.exitCode).toBe(0);
    expect(r.tests).toBeNull();
    expect(r.resultsError).toContain("no results");
  });

  it("collects files written by the command, beyond the stdout cap", async () => {
    const r = await project({
      language: "python",
      files: { "gen.py": "import json\nprint(json.dumps(list(range(100000))))\n" },
      command: { kind: "shell", cmd: "python3 gen.py > out.json" },
      collect: ["out.json", "missing.json"],
    });
    expect(Object.keys(r.files)).toEqual(["out.json"]);
    expect(JSON.parse(r.files["out.json"]!)).toHaveLength(100000);
  });
});
