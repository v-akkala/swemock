import { handle } from "@/server/http/errors";
import { advancePhase } from "@/server/interview/engine";

export const dynamic = "force-dynamic";

export function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    advancePhase((await ctx.params).id);
    return Response.json({ ok: true });
  });
}
