import "server-only";
import { ZodError } from "zod";
import { JudgeError } from "../judge/client";

/** An error with an HTTP status and a message that is safe to show the user. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wraps a route handler: known errors become JSON responses, anything else is logged and returns 500. */
export async function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof JudgeError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError) {
      return Response.json({ error: "Invalid request", issues: e.issues }, { status: 400 });
    }
    console.error("[swemock] unhandled error:", e);
    return Response.json({ error: "Something went wrong on the server." }, { status: 500 });
  }
}

/** Reads and validates a JSON body. */
export async function readJson<T>(request: Request, schema: { parse(v: unknown): T }): Promise<T> {
  const body: unknown = await request.json().catch(() => {
    throw new ApiError(400, "Body must be JSON.");
  });
  return schema.parse(body);
}
