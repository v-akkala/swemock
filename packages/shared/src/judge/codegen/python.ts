import { resolveMethod, resolveParams, type ResolvedParam, type Signature } from "../signature";
import type { TypeNode } from "../types";
import { nodeComment } from "./node-docs";
import type { LanguageCodegen } from "./types";

export function pythonType(t: TypeNode): string {
  switch (t.kind) {
    case "void":
      return "None";
    case "array":
    case "list":
      return `List[${pythonType(t.of)}]`;
    case "base":
      return {
        int: "int",
        long: "int",
        double: "float",
        bool: "bool",
        char: "str",
        string: "str",
        ListNode: "Optional[ListNode]",
        TreeNode: "Optional[TreeNode]",
      }[t.name];
  }
}

function params(ps: ResolvedParam[]): string {
  return ["self", ...ps.map((p) => `${p.name}: ${pythonType(p.type)}`)].join(", ");
}

const DOCS = {
  ListNode: "class ListNode:\n    def __init__(self, val=0, next=None):\n        self.val = val\n        self.next = next",
  TreeNode:
    "class TreeNode:\n    def __init__(self, val=0, left=None, right=None):\n        self.val = val\n        self.left = left\n        self.right = right",
};

/** Python needs no generated driver: images/sandbox-python/driver.py reads the signature at runtime. */
export const python: LanguageCodegen = {
  stub(sig: Signature): string {
    const header = nodeComment(sig, "# ", DOCS);
    if (sig.kind === "function") {
      const m = resolveMethod(sig);
      return `${header}class Solution:\n    def ${m.name}(${params(m.params)}) -> ${pythonType(m.returns)}:\n        pass\n`;
    }
    const ctor = `    def __init__(${params(resolveParams(sig.constructorParams))}):\n        pass\n`;
    const methods = sig.methods
      .map(resolveMethod)
      .map((m) => `    def ${m.name}(${params(m.params)}) -> ${pythonType(m.returns)}:\n        pass\n`);
    return `${header}class ${sig.className}:\n\n${[ctor, ...methods].join("\n")}`;
  },
  driverFiles: () => ({}),
};
