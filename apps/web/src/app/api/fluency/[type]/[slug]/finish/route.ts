import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { finishPractice } from "@/server/fluency/service";
import { sessionSchema, typeParam, type Ctx } from "@/server/fluency/route-utils";

export const dynamic = "force-dynamic";

/** Practice: end the attempt; the debrief shows the results. */
export function POST(request: Request, ctx: Ctx) {
  return handle(async () => {
    const { type, slug } = await ctx.params;
    const b = await readJson(request, z.object({ sessionId: sessionSchema }));
    return Response.json(finishPractice(typeParam(type), slug, b.sessionId));
  });
}
