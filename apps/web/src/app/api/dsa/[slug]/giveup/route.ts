import { handle, readJson } from "@/server/http/errors";
import { sessionBodySchema } from "@/server/dsa/schemas";
import { giveUp } from "@/server/dsa/service";

export const dynamic = "force-dynamic";

export function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await ctx.params;
    return Response.json(giveUp({ slug, ...(await readJson(request, sessionBodySchema)) }));
  });
}
