import { z } from "zod";
import { ApiError, handle, readJson } from "@/server/http/errors";
import { getSession } from "@/server/dsa/store";
import { decideMatch } from "@/server/fluency/findings";
import { loadScorecard } from "@/server/scoring/scorecard";

export const dynamic = "force-dynamic";

/** The candidate's call on a borderline match: it matches that planted issue, or it doesn't. */
export function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const session = getSession(id);
    if (!session) throw new ApiError(404, "Unknown session.");
    if (session.status === "active") throw new ApiError(409, "Decide after the round ends.");
    const b = await readJson(request, z.object({ findingId: z.string().max(40), plantedId: z.union([z.string().max(60), z.literal(false)]) }));
    decideMatch(id, b.findingId, b.plantedId);
    return Response.json(loadScorecard(id));
  });
}
