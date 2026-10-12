/**
 * Language-neutral type grammar for DSA signatures.
 *
 *   type := base | type "[]" | "list<" type ">"
 *   base := int | long | double | bool | char | string | ListNode | TreeNode
 *
 * `T[]` and `list<T>` render the same in Python and C++; the distinction is kept so languages with
 * separate array and list types can be added later. `void` is allowed only as a return type.
 * Each language renders types in its own codegen module (codegen/<language>.ts).
 */
export const BASE_TYPES = ["int", "long", "double", "bool", "char", "string", "ListNode", "TreeNode"] as const;
export type BaseType = (typeof BASE_TYPES)[number];

export type TypeNode =
  | { kind: "base"; name: BaseType }
  | { kind: "array"; of: TypeNode }
  | { kind: "list"; of: TypeNode }
  | { kind: "void" };

export class TypeParseError extends Error {}

export function parseType(src: string, opts: { allowVoid?: boolean } = {}): TypeNode {
  const s = src.replace(/\s+/g, "");
  if (s === "void") {
    if (!opts.allowVoid) throw new TypeParseError("void is only allowed as a return type");
    return { kind: "void" };
  }
  const node = parseInner(s, src);
  if (depth(node) > 4) throw new TypeParseError(`Type nests too deeply: ${src}`);
  return node;
}

function parseInner(s: string, original: string): TypeNode {
  if (s.endsWith("[]")) {
    const of = parseInner(s.slice(0, -2), original);
    // Arrays of lists don't map to every language (e.g. no generic arrays in Java); keep signatures portable.
    if (of.kind === "list") throw new TypeParseError(`Arrays of lists are not supported: ${original}`);
    return { kind: "array", of };
  }
  if (s.startsWith("list<") && s.endsWith(">")) return { kind: "list", of: parseInner(s.slice(5, -1), original) };
  if ((BASE_TYPES as readonly string[]).includes(s)) return { kind: "base", name: s as BaseType };
  throw new TypeParseError(`Unknown type: ${original}`);
}

function depth(t: TypeNode): number {
  return t.kind === "array" || t.kind === "list" ? 1 + depth(t.of) : 0;
}

/** Canonical string form, also used as a cache key for generated helpers. */
export function typeToString(t: TypeNode): string {
  switch (t.kind) {
    case "void":
      return "void";
    case "base":
      return t.name;
    case "array":
      return `${typeToString(t.of)}[]`;
    case "list":
      return `list<${typeToString(t.of)}>`;
  }
}

export function usesNode(t: TypeNode, name: "ListNode" | "TreeNode"): boolean {
  if (t.kind === "base") return t.name === name;
  if (t.kind === "array" || t.kind === "list") return usesNode(t.of, name);
  return false;
}
