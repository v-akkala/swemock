import { describe, expect, it } from "vitest";
import { applyHunks, changedNewLines, computeHunks } from "./diff";
import { matchFindings, type Finding, type Planted } from "./match";
import { mutationCandidates, rankedMutations, shouldMutate } from "./mutate";

describe("hunks", () => {
  const before = ["a", "b", "c", "d", "e", "f"].join("\n");
  const after = ["a", "B", "c", "d", "x", "y", "e"].join("\n"); // b→B, then f removed, x y inserted before e? see below

  it("splits a change into hunks and applies any subset", () => {
    const hunks = computeHunks(before, after);
    expect(hunks.length).toBe(3);
    expect(hunks[0]).toMatchObject({ id: "h1", oldStart: 2, oldLines: ["b"], newLines: ["B"] });
    expect(applyHunks(before, hunks, new Set(hunks.map((h) => h.id)))).toBe(after);
    expect(applyHunks(before, hunks, new Set())).toBe(before);
    const onlyFirst = applyHunks(before, hunks, new Set(["h1"]));
    expect(onlyFirst.split("\n")).toEqual(["a", "B", "c", "d", "e", "f"]);
    const skipFirst = applyHunks(before, hunks, new Set(["h2", "h3"]));
    expect(skipFirst.split("\n")[1]).toBe("b");
    expect(skipFirst).toContain("x");
  });

  it("handles identical, empty, and pure insertion or deletion", () => {
    expect(computeHunks("a\nb", "a\nb")).toEqual([]);
    const ins = computeHunks("a\nc", "a\nb\nc");
    expect(ins).toEqual([{ id: "h1", oldStart: 2, oldLines: [], newLines: ["b"] }]);
    expect(applyHunks("a\nc", ins, new Set(["h1"]))).toBe("a\nb\nc");
    const del = computeHunks("a\nb\nc", "a\nc");
    expect(applyHunks("a\nb\nc", del, new Set(["h1"]))).toBe("a\nc");
    expect(applyHunks("", computeHunks("", "x"), new Set(["h1"]))).toBe("x");
  });

  it("reports the changed lines of the new text", () => {
    expect([...changedNewLines("a\nb\nc", "a\nB\nc\nd")].sort()).toEqual([2, 4]);
  });
});

describe("mutations", () => {
  const py = [
    "def total(items, start=0):",
    "    if not items:",
    "        return start",
    "    acc = start",
    "    for i in range(len(items)):",
    "        if items[i] < limit:",
    "            acc = add(acc, items[i])",
    "    f.close()",
    "    # if x < y: a comment",
    "    msg = 'a < b'",
    "    return acc",
  ].join("\n");

  it("finds each kind of operator on realistic lines, and never in comments or strings", () => {
    const by = Object.fromEntries(mutationCandidates(py, "python").map((m) => [`${m.op}@${m.line}`, m]));
    expect(by["off-by-one@5"]!.after).toBe("    for i in range(len(items) - 1):");
    expect(by["flipped-comparison@6"]!.after).toBe("        if items[i] >= limit:");
    expect(by["removed-check@2"]!.text.split("\n").slice(0, 3)).toEqual(["def total(items, start=0):", "    acc = start", "    for i in range(len(items)):"]);
    expect(by["swapped-arguments@7"]!.after).toBe("            acc = add(items[i], acc)");
    expect(by["changed-default@1"]!.after).toBe("def total(items, start=1):");
    expect(by["dropped-close@8"]!.text).not.toContain("f.close()");
    expect(mutationCandidates(py, "python").some((m) => m.line === 9 || m.line === 10)).toBe(false);
  });

  it("restricts candidates to the given lines and ranks them deterministically", () => {
    const only = new Set([5, 6]);
    expect(mutationCandidates(py, "python", only).every((m) => m.line === 5 || m.line === 6)).toBe(true);
    const a = rankedMutations(py, "python", "seed-1").map((m) => `${m.op}@${m.line}`);
    expect(a).toEqual(rankedMutations(py, "python", "seed-1").map((m) => `${m.op}@${m.line}`));
    expect(a).not.toEqual(rankedMutations(py, "python", "seed-2").map((m) => `${m.op}@${m.line}`));
  });

  it("handles C++ lines", () => {
    const cpp = ["int sum(const int* a, int n) {", "  if (a == nullptr) return 0;", "  int s = 0;", "  for (int i = 0; i < n; i++) s += a[i];", "  return s;", "}"].join("\n");
    const ops = mutationCandidates(cpp, "cpp").map((m) => m.op);
    expect(ops).toEqual(expect.arrayContaining(["removed-check", "off-by-one", "flipped-comparison"]));
  });

  it("mutates about one reply in five, deterministically", () => {
    const hits = Array.from({ length: 2000 }, (_, i) => shouldMutate(`s${i}`)).filter(Boolean).length;
    expect(hits).toBeGreaterThan(300);
    expect(hits).toBeLessThan(500);
    expect(shouldMutate("x")).toBe(shouldMutate("x"));
  });
});

describe("matchFindings", () => {
  const planted: Planted[] = [
    { id: "b1", file: "a.py", lines: [10, 12], category: "off-by-one", severity: "high" },
    { id: "b2", file: "a.py", lines: [40, 40], category: "resource-leak", severity: "medium" },
    { id: "b3", file: "b.py", lines: [5, 8], category: "performance", severity: "low" },
  ];
  const f = (id: string, file: string, a: number, b: number, category: string, severity: Finding["severity"] = "medium"): Finding => ({ id, file, lines: [a, b], category, severity });

  it("matches within two lines and the same category, once per planted issue", () => {
    const r = matchFindings([f("x", "a.py", 14, 14, "off-by-one", "high"), f("dup", "a.py", 11, 11, "off-by-one")], planted);
    expect(r.matches).toEqual([{ findingId: "x", plantedId: "b1", confirmed: false }]);
    expect(r.falsePositives).toEqual(["dup"]);
    expect(r.missed).toEqual(["b2", "b3"]);
    expect(r.recall).toBeCloseTo(3 / (3 + 2 + 1));
    expect(r.precision).toBe(0.5);
    expect(r.severityCalibration).toBe(1);
  });

  it("flags a different category on overlapping lines as borderline until the user decides", () => {
    const finding = f("x", "a.py", 40, 41, "error-handling");
    expect(matchFindings([finding], planted).borderline).toEqual([{ findingId: "x", plantedId: "b2" }]);
    const confirmed = matchFindings([finding], planted, [], { x: "b2" });
    expect(confirmed.matches[0]).toMatchObject({ plantedId: "b2", confirmed: true });
    expect(matchFindings([finding], planted, [], { x: false }).falsePositives).toEqual(["x"]);
  });

  it("does not punish findings that hit acceptable issues, and weighs severity calibration", () => {
    const r = matchFindings([f("a", "b.py", 20, 21, "style"), f("b", "b.py", 6, 6, "performance", "critical")], planted, [{ file: "b.py", lines: [20, 25], category: "style" }]);
    expect(r.acceptable).toEqual(["a"]);
    expect(r.falsePositives).toEqual([]);
    expect(r.precision).toBe(1);
    expect(r.severityCalibration).toBe(0); // low vs critical: 3 levels off
  });

  it("ignores other files and handles an empty review of a clean change", () => {
    expect(matchFindings([f("x", "other.py", 10, 10, "off-by-one")], planted).matches).toEqual([]);
    expect(matchFindings([], []).precision).toBe(1);
    expect(matchFindings([], planted).precision).toBe(0);
  });
});
