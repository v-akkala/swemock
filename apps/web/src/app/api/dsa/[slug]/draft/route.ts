import { handle, readJson } from "@/server/http/errors";
import { draftBodySchema } from "@/server/dsa/schemas";
import { saveCode } from "@/server/dsa/service";

export const dynamic = "force-dynamic";

export function PUT(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await ctx.params;
    saveCode({ slug, ...(await readJson(request, draftBodySchema)) });
    return Response.json({ ok: true });
  });
}
