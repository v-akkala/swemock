import { handle, readJson } from "@/server/http/errors";
import { hintBodySchema } from "@/server/dsa/schemas";
import { revealHint } from "@/server/dsa/service";

export const dynamic = "force-dynamic";

export function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await ctx.params;
    return Response.json(revealHint({ slug, ...(await readJson(request, hintBodySchema)) }));
  });
}
