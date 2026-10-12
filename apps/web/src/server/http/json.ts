import "server-only";
import type { z } from "zod";
import { JudgeError } from "../judge/client";

/** Parses a JSON body with a Zod schema; returns a 400 Response on failure. */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: Response }> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, response: Response.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 }) };
}

export function judgeErrorResponse(e: unknown): Response {
  if (e instanceof JudgeError) return Response.json({ error: e.message }, { status: e.status });
  throw e;
}
