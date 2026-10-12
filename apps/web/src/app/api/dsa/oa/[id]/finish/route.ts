import { ApiError, handle } from "@/server/http/errors";
import { getOa } from "@/server/dsa/oa";
import { addEvent, endSession } from "@/server/dsa/store";

export const dynamic = "force-dynamic";

export function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const oa = getOa(id);
    if (!oa) throw new ApiError(404, "Unknown assessment.");
    if (oa.session.status === "active") {
      addEvent(id, "phase_change", { to: "finished" });
      endSession(id, "ended");
    }
    return Response.json({ ok: true });
  });
}
