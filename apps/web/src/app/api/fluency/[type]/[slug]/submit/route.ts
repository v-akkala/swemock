import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { submit } from "@/server/fluency/service";
import { filesSchema, sessionSchema, typeParam, type Ctx } from "@/server/fluency/route-utils";

export const dynamic = "force-dynamic";

export function POST(request: Request, ctx: Ctx) {
  return handle(async () => {
    const { type, slug } = await ctx.params;
    const b = await readJson(request, z.object({ files: filesSchema, sessionId: sessionSchema }));
    return Response.json(await submit({ type: typeParam(type), slug, ...b }));
  });
}
