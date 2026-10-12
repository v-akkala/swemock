import { handle } from "@/server/http/errors";
import { deleteResume } from "@/server/resume/store";

export const dynamic = "force-dynamic";

export function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    deleteResume((await ctx.params).id);
    return Response.json({ ok: true });
  });
}
