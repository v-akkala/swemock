import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { introduceChange } from "@/server/lld/service";

export const dynamic = "force-dynamic";

export function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await ctx.params;
    const b = await readJson(request, z.object({ sessionId: z.string().max(40).optional() }));
    return Response.json(introduceChange({ slug, ...b }));
  });
}
