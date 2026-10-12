import { describe, expect, it } from "vitest";
import { CODEGEN, cppType, generateStub, pythonType } from "./codegen";
import { LANGUAGES } from "./protocol";
import { signatureSchema, type Signature } from "./signature";
import { parseType, TypeParseError, typeToString } from "./types";

describe("parseType", () => {
  it("round-trips nested types", () => {
    for (const t of ["int", "long[]", "list<list<int>>", "char[][]", "list<string[]>", "TreeNode", "ListNode[]"]) {
      expect(typeToString(parseType(t))).toBe(t);
    }
  });

  it("rejects unknown types, void parameters, arrays of lists, and deep nesting", () => {
    expect(() => parseType("float")).toThrow(TypeParseError);
    expect(() => parseType("void")).toThrow(TypeParseError);
    expect(parseType("void", { allowVoid: true })).toEqual({ kind: "void" });
    expect(() => parseType("list<int>[]")).toThrow(/Arrays of lists/);
    expect(() => parseType("int[][][][][]")).toThrow(/deeply/);
  });

  it("renders per language", () => {
    expect(pythonType(parseType("list<int[]>"))).toBe("List[List[int]]");
    expect(cppType(parseType("list<int[]>"))).toBe("vector<vector<int>>");
    expect(cppType(parseType("long"))).toBe("long long");
    expect(pythonType(parseType("TreeNode"))).toBe("Optional[TreeNode]");
  });
});

describe("signatureSchema", () => {
  it("validates types and identifiers", () => {
    const ok = { kind: "function", name: "f", params: [{ name: "a", type: "int[]" }], returns: "void" };
    expect(signatureSchema.safeParse(ok).success).toBe(true);
    expect(signatureSchema.safeParse({ ...ok, params: [{ name: "a", type: "nope" }] }).success).toBe(false);
    expect(signatureSchema.safeParse({ ...ok, name: "1bad" }).success).toBe(false);
  });
});

const fn: Signature = {
  kind: "function",
  name: "mergeLists",
  params: [
    { name: "lists", type: "ListNode[]" },
    { name: "k", type: "int" },
  ],
  returns: "ListNode",
};

const design: Signature = {
  kind: "design",
  className: "Cache",
  constructorParams: [{ name: "capacity", type: "int" }],
  methods: [
    { name: "get", params: [{ name: "key", type: "string" }], returns: "int" },
    { name: "put", params: [{ name: "key", type: "string" }, { name: "value", type: "int" }], returns: "void" },
  ],
};

describe("stubs", () => {
  it("has a codegen module for every language", () => {
    expect(Object.keys(CODEGEN).sort()).toEqual([...LANGUAGES].sort());
  });

  it("generates LeetCode-style Python stubs with node docs", () => {
    const s = generateStub(fn, "python");
    expect(s).toContain("# Definition for ListNode (provided, don't redefine it):");
    expect(s).toContain(
      "class Solution:\n    def mergeLists(self, lists: List[Optional[ListNode]], k: int) -> Optional[ListNode]:\n        pass\n",
    );
    expect(generateStub(design, "python")).toBe(
      [
        "class Cache:",
        "",
        "    def __init__(self, capacity: int):",
        "        pass",
        "",
        "    def get(self, key: str) -> int:",
        "        pass",
        "",
        "    def put(self, key: str, value: int) -> None:",
        "        pass",
        "",
      ].join("\n"),
    );
  });

  it("generates C++ stubs passing containers by reference", () => {
    expect(generateStub(fn, "cpp")).toContain("    ListNode* mergeLists(vector<ListNode*>& lists, int k) {");
    expect(generateStub(design, "cpp")).toContain("    Cache(int capacity) {");
    expect(generateStub(design, "cpp")).toContain("    void put(string key, int value) {");
  });
});

describe("C++ driver", () => {
  it("converts arguments by name and dispatches design operations", () => {
    const main = CODEGEN.cpp.driverFiles(fn)["main.cpp"]!;
    expect(main).toContain('auto a0 = sw::from_json<vector<ListNode*>>(in.at("lists"));');
    expect(main).toContain("auto r = sw::timed([&] { return sol.mergeLists(a0, a1); });");
    const d = CODEGEN.cpp.driverFiles(design)["main.cpp"]!;
    expect(d).toContain('if (op == "get")');
    expect(d).toContain('else if (op == "put")');
    expect(d).toContain("sw::timed_void([&] { obj->put(a0, a1); });");
  });

  it("Python needs no generated driver", () => {
    expect(CODEGEN.python.driverFiles(fn)).toEqual({});
  });
});
