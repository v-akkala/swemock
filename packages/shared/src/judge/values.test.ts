import { describe, expect, it } from "vitest";
import type { Signature } from "./signature";
import { validateExpected, validateTestInput } from "./values";

const fn: Signature = {
  kind: "function",
  name: "f",
  params: [
    { name: "xs", type: "int[]" },
    { name: "t", type: "TreeNode" },
    { name: "s", type: "string" },
  ],
  returns: "list<long>",
};

const design: Signature = {
  kind: "design",
  className: "Box",
  constructorParams: [{ name: "n", type: "int" }],
  methods: [
    { name: "put", params: [{ name: "x", type: "int" }], returns: "void" },
    { name: "peek", params: [], returns: "int" },
  ],
};

describe("validateTestInput", () => {
  it("accepts well-formed function input", () => {
    expect(validateTestInput(fn, { xs: [1, -2], t: [1, null, 2], s: "ok" })).toBeNull();
  });

  it("reports the offending path", () => {
    expect(validateTestInput(fn, { xs: [1, 2.5], t: [], s: "" })).toContain("xs[1]");
    expect(validateTestInput(fn, { xs: [], t: [null], s: "" })).toContain("root");
    expect(validateTestInput(fn, { xs: [], t: [] })).toContain('missing "s"');
    expect(validateTestInput(fn, { xs: [], t: [], s: "", z: 1 })).toContain("unknown key");
    expect(validateTestInput(fn, { xs: [2 ** 31], t: [], s: "" })).toContain("32-bit");
    expect(validateTestInput(fn, [1])).toContain("object");
  });

  it("checks design operations and argument shapes", () => {
    expect(validateTestInput(design, { ops: ["Box", "put", "peek"], args: [[3], [1], []] })).toBeNull();
    expect(validateTestInput(design, { ops: ["Crate"], args: [[3]] })).toContain('"Box"');
    expect(validateTestInput(design, { ops: ["Box", "pop"], args: [[3], []] })).toContain("unknown method");
    expect(validateTestInput(design, { ops: ["Box", "put"], args: [[3], []] })).toContain("argument");
  });
});

describe("validateExpected", () => {
  it("checks return types", () => {
    expect(validateExpected(fn, {}, [1, 2])).toBeNull();
    expect(validateExpected(fn, {}, "x")).toContain("array");
  });

  it("checks design outputs per operation", () => {
    const input = { ops: ["Box", "put", "peek"], args: [[3], [1], []] };
    expect(validateExpected(design, input, [null, null, 7])).toBeNull();
    expect(validateExpected(design, input, [null, 1, 7])).toContain("void");
    expect(validateExpected(design, input, [null, null])).toContain("one entry");
  });
});
