import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { feedbackWithAi } from "@/server/packets";

export const dynamic = "force-dynamic";

/** Resume feedback (recruiter screen) or stronger answer versions (behavioral) from the connected model. */
export function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { kind } = await readJson(request, z.object({ kind: z.enum(["resume-feedback", "behavioral-rewrite"]) }));
    return Response.json({ feedback: await feedbackWithAi(id, kind) });
  });
}
