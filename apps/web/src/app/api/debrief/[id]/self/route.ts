import { z } from "zod";
import { ApiError, handle, readJson } from "@/server/http/errors";
import { addEvent, getSession } from "@/server/dsa/store";
import { saveSelfScore } from "@/server/scoring/scorecard";

export const dynamic = "force-dynamic";

export function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const session = getSession(id);
    if (!session || session.mode !== "interview") throw new ApiError(404, "Unknown interview.");
    if (session.status === "active") throw new ApiError(409, "Score yourself after the interview ends.");
    const { ticked } = await readJson(request, z.object({ ticked: z.array(z.string().max(40)).max(100) }));
    addEvent(id, "self_score", { ticked });
    return Response.json(saveSelfScore(id, ticked));
  });
}
