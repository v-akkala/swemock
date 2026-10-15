import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { askAssistant } from "@/server/fluency/assistant";
import { filesSchema, sessionSchema, typeParam, type Ctx } from "@/server/fluency/route-utils";

export const dynamic = "force-dynamic";

const context = z.array(z.object({ path: z.string().max(120), from: z.number().int().min(1).optional(), to: z.number().int().min(1).optional() })).max(8);

export function POST(request: Request, ctx: Ctx) {
  return handle(async () => {
    const { type, slug } = await ctx.params;
    const b = await readJson(request, z.object({ question: z.string().trim().min(1).max(4000), context, files: filesSchema, sessionId: sessionSchema }));
    return Response.json(await askAssistant({ type: typeParam(type), slug, ...b }));
  });
}
