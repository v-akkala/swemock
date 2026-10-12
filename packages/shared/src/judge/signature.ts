import { z } from "zod";
import { parseType, type TypeNode } from "./types";

const identifier = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "must be a valid identifier")
  .max(64);

const valueType = z.string().superRefine((s, ctx) => {
  try {
    parseType(s);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: (e as Error).message });
  }
});
const returnType = z.string().superRefine((s, ctx) => {
  try {
    parseType(s, { allowVoid: true });
  } catch (e) {
    ctx.addIssue({ code: "custom", message: (e as Error).message });
  }
});

export const paramSchema = z.object({ name: identifier, type: valueType });
export type Param = z.infer<typeof paramSchema>;

export const functionSignatureSchema = z.object({
  kind: z.literal("function"),
  /** Method name on `class Solution` (Python, C++, Java) or top-level function (TypeScript). */
  name: identifier,
  params: z.array(paramSchema).max(8),
  returns: returnType,
});

export const methodSchema = z.object({ name: identifier, params: z.array(paramSchema).max(8), returns: returnType });

export const designSignatureSchema = z.object({
  kind: z.literal("design"),
  className: identifier,
  constructorParams: z.array(paramSchema).max(8),
  methods: z.array(methodSchema).min(1).max(20),
});

export const signatureSchema = z.discriminatedUnion("kind", [functionSignatureSchema, designSignatureSchema]);
export type Signature = z.infer<typeof signatureSchema>;
export type FunctionSignature = z.infer<typeof functionSignatureSchema>;
export type DesignSignature = z.infer<typeof designSignatureSchema>;

export interface ResolvedParam {
  name: string;
  type: TypeNode;
}
export interface ResolvedMethod {
  name: string;
  params: ResolvedParam[];
  returns: TypeNode;
}

export function resolveParams(params: Param[]): ResolvedParam[] {
  return params.map((p) => ({ name: p.name, type: parseType(p.type) }));
}

export function resolveMethod(m: { name: string; params: Param[]; returns: string }): ResolvedMethod {
  return { name: m.name, params: resolveParams(m.params), returns: parseType(m.returns, { allowVoid: true }) };
}

/** Every type used anywhere in a signature (for deciding which helpers/imports to emit). */
export function allTypes(sig: Signature): TypeNode[] {
  if (sig.kind === "function") {
    const m = resolveMethod(sig);
    return [...m.params.map((p) => p.type), m.returns];
  }
  return [
    ...resolveParams(sig.constructorParams).map((p) => p.type),
    ...sig.methods.flatMap((m) => {
      const r = resolveMethod(m);
      return [...r.params.map((p) => p.type), r.returns];
    }),
  ];
}
