import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { setDecision } from "@/server/fluency/findings";
import { resolveSession } from "@/server/fluency/service";
import { sessionSchema, typeParam, type Ctx } from "@/server/fluency/route-utils";

export const dynamic = "force-dynamic";

/** A PR review's final decision with its summary comment. */
export function PUT(request: Request, ctx: Ctx) {
  return handle(async () => {
    const { type, slug } = await ctx.params;
    const b = await readJson(request, z.object({ value: z.enum(["approve", "request_changes", "reject"]), summary: z.string().max(4000).default(""), sessionId: sessionSchema }));
    const { session } = resolveSession(typeParam(type), slug, b.sessionId);
    setDecision(session.id, b.value, b.summary);
    return Response.json({ sessionId: session.id });
  });
}
