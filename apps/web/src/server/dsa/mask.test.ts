import type { DsaRunResult } from "@swemock/shared";
import { describe, expect, it } from "vitest";
import { maskTests, rateEfficiency, type CaseInfo } from "./mask";

const test = (id: string, verdict: DsaRunResult["tests"][number]["verdict"]): DsaRunResult["tests"][number] => ({
  id,
  verdict,
  timeMs: 1.5,
  memoryKb: 4000,
  actual: '"SECRET-ACTUAL"',
  stdout: "SECRET-STDOUT",
  stderr: "SECRET-STDERR",
  message: "SECRET-MESSAGE",
});

const result = (tests: DsaRunResult["tests"]): DsaRunResult => ({
  verdict: "wrong_answer",
  passed: 0,
  total: tests.length,
  compileOutput: null,
  tests,
  maxTimeMs: 1.5,
  maxMemoryKb: 4000,
});

const cases = new Map<string, CaseInfo>([
  ["v1", { id: "v1", hidden: false, label: "Sample 1", kind: null, input: { n: 1 }, expected: 2 }],
  ["h3", { id: "h3", hidden: true, label: "Hidden test #3", kind: "stress", input: { n: "SECRET-INPUT" }, expected: "SECRET-EXPECTED" }],
  ["custom", { id: "custom", hidden: false, label: "Custom input", kind: null, input: { n: 5 } }],
]);

describe("maskTests", () => {
  it("shows visible tests in full", () => {
    const [t] = maskTests(result([test("v1", "wrong_answer")]), cases);
    expect(t).toMatchObject({ hidden: false, input: { n: 1 }, expected: 2, actual: '"SECRET-ACTUAL"', stdout: "SECRET-STDOUT" });
  });

  it("never leaks anything about hidden tests but their label, category and verdict", () => {
    const [t] = maskTests(result([test("h3", "wrong_answer")]), cases);
    expect(t).toEqual({ id: "h3", label: "Hidden test #3", hidden: true, kind: "stress", verdict: "wrong_answer", timeMs: 1.5, memoryKb: 4000 });
    expect(JSON.stringify(t)).not.toMatch(/SECRET/);
  });

  it("drops results for tests that weren't sent", () => {
    expect(maskTests(result([test("h99", "accepted")]), cases)).toEqual([]);
  });

  it("keeps custom input results visible", () => {
    const [t] = maskTests(result([test("custom", "ran")]), cases);
    expect(t).toMatchObject({ hidden: false, input: { n: 5 }, verdict: "ran" });
    expect(t).not.toHaveProperty("expected", expect.anything());
  });
});

describe("rateEfficiency", () => {
  it("compares against the reference with a noise floor", () => {
    expect(rateEfficiency(1, 0.1)).toBe("comparable");
    expect(rateEfficiency(30, 10)).toBe("comparable");
    expect(rateEfficiency(31, 10)).toBe("slower");
    expect(rateEfficiency(100, 10)).toBe("slower");
    expect(rateEfficiency(101, 10)).toBe("much-slower");
  });
});
