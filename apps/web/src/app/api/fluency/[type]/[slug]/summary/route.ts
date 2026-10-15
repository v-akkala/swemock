import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { setSummary } from "@/server/fluency/findings";
import { resolveSession } from "@/server/fluency/service";
import { sessionSchema, typeParam, type Ctx } from "@/server/fluency/route-utils";

export const dynamic = "force-dynamic";

/** The candidate's summary of what the system does (comprehension task 1). */
export function PUT(request: Request, ctx: Ctx) {
  return handle(async () => {
    const { type, slug } = await ctx.params;
    const b = await readJson(request, z.object({ text: z.string().max(8000), sessionId: sessionSchema }));
    const { session } = resolveSession(typeParam(type), slug, b.sessionId);
    setSummary(session.id, b.text);
    return Response.json({ sessionId: session.id });
  });
}
