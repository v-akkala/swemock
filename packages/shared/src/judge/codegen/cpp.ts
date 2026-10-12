import {
  resolveMethod,
  resolveParams,
  type DesignSignature,
  type ResolvedMethod,
  type ResolvedParam,
  type Signature,
} from "../signature";
import type { TypeNode } from "../types";
import { nodeComment } from "./node-docs";
import type { LanguageCodegen } from "./types";

export function cppType(t: TypeNode): string {
  switch (t.kind) {
    case "void":
      return "void";
    case "array":
    case "list":
      return `vector<${cppType(t.of)}>`;
    case "base":
      return {
        int: "int",
        long: "long long",
        double: "double",
        bool: "bool",
        char: "char",
        string: "string",
        ListNode: "ListNode*",
        TreeNode: "TreeNode*",
      }[t.name];
  }
}

/** Containers by reference, like LeetCode; scalars and strings by value. */
function param(p: ResolvedParam): string {
  const t = cppType(p.type);
  return p.type.kind === "array" || p.type.kind === "list" ? `${t}& ${p.name}` : `${t} ${p.name}`;
}

const DOCS = {
  ListNode: "struct ListNode {\n    int val;\n    ListNode *next;\n    ListNode(int x = 0, ListNode *next = nullptr);\n};",
  TreeNode:
    "struct TreeNode {\n    int val;\n    TreeNode *left, *right;\n    TreeNode(int x = 0, TreeNode *left = nullptr, TreeNode *right = nullptr);\n};",
};

function stub(sig: Signature): string {
  const header = nodeComment(sig, "// ", DOCS);
  const method = (m: ResolvedMethod) =>
    `    ${cppType(m.returns)} ${m.name}(${m.params.map(param).join(", ")}) {\n        \n    }\n`;
  if (sig.kind === "function") {
    return `${header}class Solution {\npublic:\n${method(resolveMethod(sig))}};\n`;
  }
  const ctor = `    ${sig.className}(${resolveParams(sig.constructorParams).map(param).join(", ")}) {\n        \n    }\n`;
  return `${header}class ${sig.className} {\npublic:\n${[ctor, ...sig.methods.map(resolveMethod).map(method)].join("\n")}};\n`;
}

// ---- driver (main.cpp) ----------------------------------------------------------
// Uses the runtime in images/sandbox-cpp/swemock.hpp. Protocol: one JSON test input per stdin
// line; one JSON result per line on fd 3 (see images/common/agent.py).

function args(m: ResolvedMethod, source: (i: number, name: string) => string, indent: string): string[] {
  return m.params.map((p, i) => `${indent}auto a${i} = sw::from_json<${cppType(p.type)}>(${source(i, p.name)});`);
}

function call(m: ResolvedMethod, target: string, indent: string): string[] {
  const list = m.params.map((_, i) => `a${i}`).join(", ");
  if (m.returns.kind === "void") return [`${indent}sw::timed_void([&] { ${target}${m.name}(${list}); });`];
  return [`${indent}auto r = sw::timed([&] { return ${target}${m.name}(${list}); });`];
}

function functionBody(m: ResolvedMethod): string {
  const i = "        ";
  return [
    `${i}Solution sol;`,
    ...args(m, (_, name) => `in.at(${JSON.stringify(name)})`, i),
    ...call(m, "sol.", i),
    m.returns.kind === "void" ? `${i}return sw::Json();` : `${i}return sw::to_json(r);`,
  ].join("\n");
}

function designBody(sig: DesignSignature): string {
  const i = "        ";
  const ctor = resolveParams(sig.constructorParams);
  const lines = [
    `${i}const sw::Json& ops = in.at("ops");`,
    `${i}const sw::Json& args = in.at("args");`,
    `${i}sw::require(ops.size() == args.size() && ops.size() > 0 && ops[0].str() == ${JSON.stringify(sig.className)}, "bad design-problem input");`,
    `${i}sw::Json out = sw::Json::array();`,
    `${i}${sig.className}* obj = nullptr;`,
    `${i}{`,
    `${i}    const sw::Json& a = args[0];`,
    ...ctor.map((p, k) => `${i}    auto a${k} = sw::from_json<${cppType(p.type)}>(a[${k}]);`),
    `${i}    sw::timed_void([&] { obj = new ${sig.className}(${ctor.map((_, k) => `a${k}`).join(", ")}); });`,
    `${i}    out.push(sw::Json());`,
    `${i}}`,
    `${i}for (size_t k = 1; k < ops.size(); k++) {`,
    `${i}    const string& op = ops[k].str();`,
    `${i}    const sw::Json& a = args[k];`,
  ];
  sig.methods.map(resolveMethod).forEach((m, idx) => {
    lines.push(`${i}    ${idx === 0 ? "if" : "else if"} (op == ${JSON.stringify(m.name)}) {`);
    lines.push(...args(m, (n) => `a[${n}]`, `${i}        `));
    lines.push(...call(m, "obj->", `${i}        `));
    lines.push(`${i}        out.push(${m.returns.kind === "void" ? "sw::Json()" : "sw::to_json(r)"});`);
    lines.push(`${i}    }`);
  });
  lines.push(`${i}    else sw::require(false, "unknown operation: " + op);`, `${i}}`, `${i}return out;`);
  return lines.join("\n");
}

export function cppDriver(sig: Signature): string {
  const body = sig.kind === "function" ? functionBody(resolveMethod(sig)) : designBody(sig);
  return [
    '#include "swemock.hpp"',
    '#include "solution.cpp"',
    "",
    "int main() {",
    "    return sw::serve([](const sw::Json& in) -> sw::Json {",
    body,
    "    });",
    "}",
    "",
  ].join("\n");
}

export const cpp: LanguageCodegen = {
  stub,
  driverFiles: (sig) => ({ "main.cpp": cppDriver(sig) }),
};
