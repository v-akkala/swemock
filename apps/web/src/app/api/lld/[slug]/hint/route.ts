import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { revealLldHint } from "@/server/lld/service";

export const dynamic = "force-dynamic";

export function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await ctx.params;
    const b = await readJson(request, z.object({ level: z.number().int().min(1).max(4), sessionId: z.string().max(40).optional() }));
    return Response.json(revealLldHint({ slug, ...b }));
  });
}
