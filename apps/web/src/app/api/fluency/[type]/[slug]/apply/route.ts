import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { logApply } from "@/server/fluency/assistant";
import { sessionSchema, typeParam, type Ctx } from "@/server/fluency/route-utils";

export const dynamic = "force-dynamic";

/** Logs which hunks of a proposal the candidate accepted and rejected (the code itself stays in the editor). */
export function POST(request: Request, ctx: Ctx) {
  return handle(async () => {
    const { type, slug } = await ctx.params;
    const b = await readJson(request, z.object({ proposalId: z.string().max(60), path: z.string().max(120), accepted: z.array(z.string().max(20)).max(200), rejected: z.array(z.string().max(20)).max(200), sessionId: sessionSchema }));
    logApply({ type: typeParam(type), slug, ...b });
    return Response.json({ ok: true });
  });
}
