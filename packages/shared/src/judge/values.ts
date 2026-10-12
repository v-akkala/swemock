import { resolveMethod, resolveParams, type ResolvedMethod, type Signature } from "./signature";
import type { TypeNode } from "./types";

const INT_MIN = -(2 ** 31);
const INT_MAX = 2 ** 31 - 1;

/** Returns an error message if `v` can't be a value of type `t`, otherwise null. */
export function validateValue(t: TypeNode, v: unknown, path = "value"): string | null {
  switch (t.kind) {
    case "void":
      return v === null ? null : `${path}: expected null for a void result`;
    case "array":
    case "list": {
      if (!Array.isArray(v)) return `${path}: expected an array`;
      for (let i = 0; i < v.length; i++) {
        const err = validateValue(t.of, v[i], `${path}[${i}]`);
        if (err) return err;
      }
      return null;
    }
    case "base":
      switch (t.name) {
        case "int":
          return Number.isInteger(v) && (v as number) >= INT_MIN && (v as number) <= INT_MAX
            ? null
            : `${path}: expected a 32-bit integer`;
        case "long":
          return Number.isSafeInteger(v) ? null : `${path}: expected an integer within ±2^53 (JSON numbers are doubles)`;
        case "double":
          return typeof v === "number" && Number.isFinite(v) ? null : `${path}: expected a finite number`;
        case "bool":
          return typeof v === "boolean" ? null : `${path}: expected true or false`;
        case "char":
          return typeof v === "string" && [...v].length === 1 ? null : `${path}: expected a one-character string`;
        case "string":
          return typeof v === "string" ? null : `${path}: expected a string`;
        case "ListNode": {
          if (!Array.isArray(v)) return `${path}: expected an array (a linked list as values)`;
          return v.every((x) => Number.isInteger(x)) ? null : `${path}: linked list values must be integers`;
        }
        case "TreeNode": {
          if (!Array.isArray(v)) return `${path}: expected an array (level order, null for missing)`;
          if (v.length > 0 && v[0] === null) return `${path}: the root can't be null; use [] for an empty tree`;
          return v.every((x) => x === null || Number.isInteger(x)) ? null : `${path}: tree values must be integers or null`;
        }
      }
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateArgs(m: { params: { name: string; type: TypeNode }[] }, args: unknown, path: string): string | null {
  if (!Array.isArray(args) || args.length !== m.params.length) {
    return `${path}: expected ${m.params.length} argument(s)`;
  }
  for (let i = 0; i < m.params.length; i++) {
    const err = validateValue(m.params[i]!.type, args[i], `${path}[${i}]`);
    if (err) return err;
  }
  return null;
}

/** Validates a test input against a signature. Function inputs are objects keyed by parameter name. */
export function validateTestInput(sig: Signature, input: unknown): string | null {
  if (!isObject(input)) return "input must be a JSON object";
  if (sig.kind === "function") {
    const params = resolveParams(sig.params);
    const keys = Object.keys(input);
    for (const p of params) {
      if (!(p.name in input)) return `input is missing "${p.name}"`;
      const err = validateValue(p.type, input[p.name], p.name);
      if (err) return err;
    }
    const extra = keys.filter((k) => !params.some((p) => p.name === k));
    return extra.length ? `input has unknown key(s): ${extra.join(", ")}` : null;
  }
  const { ops, args } = input;
  if (!Array.isArray(ops) || !Array.isArray(args) || ops.length !== args.length || ops.length === 0) {
    return 'design input must be {"ops": [...], "args": [...]} with equal lengths';
  }
  if (ops[0] !== sig.className) return `ops[0] must be "${sig.className}"`;
  const ctor = validateArgs({ params: resolveParams(sig.constructorParams) }, args[0], "args[0]");
  if (ctor) return ctor;
  const methods = new Map<string, ResolvedMethod>(sig.methods.map((m) => [m.name, resolveMethod(m)]));
  for (let i = 1; i < ops.length; i++) {
    const m = typeof ops[i] === "string" ? methods.get(ops[i] as string) : undefined;
    if (!m) return `ops[${i}]: unknown method ${JSON.stringify(ops[i])}`;
    const err = validateArgs(m, args[i], `args[${i}]`);
    if (err) return err;
  }
  return null;
}

/** Validates an expected output against a signature (and, for design problems, the input's ops). */
export function validateExpected(sig: Signature, input: unknown, expected: unknown): string | null {
  if (sig.kind === "function") return validateValue(resolveMethod(sig).returns, expected, "expected");
  const ops = (input as { ops?: unknown[] }).ops ?? [];
  if (!Array.isArray(expected) || expected.length !== ops.length) return "expected must have one entry per operation";
  if (expected[0] !== null) return "expected[0] (the constructor) must be null";
  const methods = new Map(sig.methods.map((m) => [m.name, resolveMethod(m)]));
  for (let i = 1; i < ops.length; i++) {
    const m = methods.get(ops[i] as string);
    if (!m) continue;
    const err = validateValue(m.returns, expected[i], `expected[${i}]`);
    if (err) return err;
  }
  return null;
}

export type { TypeNode };
