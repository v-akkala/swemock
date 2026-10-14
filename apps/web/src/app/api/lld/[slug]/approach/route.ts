import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { approachCheck } from "@/server/packets";

export const dynamic = "force-dynamic";

export function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await ctx.params;
    const b = await readJson(request, z.object({ approach: z.string().trim().min(1).max(8000), sessionId: z.string().max(40).optional() }));
    return Response.json(await approachCheck(slug, b.approach, b.sessionId, "lld"));
  });
}
