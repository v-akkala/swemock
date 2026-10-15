import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { pasteAssistantReply } from "@/server/fluency/assistant";
import { filesSchema, sessionSchema, typeParam, type Ctx } from "@/server/fluency/route-utils";

export const dynamic = "force-dynamic";

export function POST(request: Request, ctx: Ctx) {
  return handle(async () => {
    const { type, slug } = await ctx.params;
    const b = await readJson(request, z.object({ text: z.string().max(100_000), promptId: z.string().max(40).optional(), activePath: z.string().max(120).nullable().optional(), files: filesSchema, sessionId: sessionSchema }));
    return Response.json(await pasteAssistantReply({ type: typeParam(type), slug, ...b }));
  });
}
