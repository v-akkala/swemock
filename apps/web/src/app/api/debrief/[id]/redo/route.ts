import { ApiError, handle } from "@/server/http/errors";
import { getSession } from "@/server/dsa/store";
import { startInterview } from "@/server/interview/engine";
import { readState } from "@/server/interview/state";

export const dynamic = "force-dynamic";

/** Start the same interview again (same problem, same kind of interviewer). */
export function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = getSession((await ctx.params).id);
    if (!session?.itemId || session.mode !== "interview") throw new ApiError(404, "Unknown interview.");
    const next = startInterview({ slug: session.itemId.split(":")[1]!, driver: session.driver, liveVia: readState(session).liveVia });
    return Response.json({ id: next.id });
  });
}
