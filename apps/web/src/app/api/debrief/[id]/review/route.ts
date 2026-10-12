import { ApiError, handle } from "@/server/http/errors";
import { getSession } from "@/server/dsa/store";
import { recordAttempt } from "@/server/dsa/srs";

export const dynamic = "force-dynamic";

/** "Add to review queue": the problem comes back tomorrow, then after 3, 7, and 14 days. */
export function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = getSession((await ctx.params).id);
    if (!session?.itemId) throw new ApiError(404, "Unknown session.");
    const card = recordAttempt(session.itemId, "needed-help");
    return Response.json({ ok: true, dueAt: card?.dueAt ?? null });
  });
}
