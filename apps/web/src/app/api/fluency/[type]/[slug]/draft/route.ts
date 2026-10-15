import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { saveWorkspace } from "@/server/fluency/service";
import { filesSchema, sessionSchema, typeParam, type Ctx } from "@/server/fluency/route-utils";

export const dynamic = "force-dynamic";

export function PUT(request: Request, ctx: Ctx) {
  return handle(async () => {
    const { type, slug } = await ctx.params;
    const b = await readJson(request, z.object({ files: filesSchema, sessionId: sessionSchema }));
    saveWorkspace({ type: typeParam(type), slug, ...b });
    return Response.json({ ok: true });
  });
}
