import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { addFinding, editFinding, findingInput, removeFinding } from "@/server/fluency/findings";
import { resolveSession } from "@/server/fluency/service";
import { sessionSchema, typeParam, type Ctx } from "@/server/fluency/route-utils";

export const dynamic = "force-dynamic";

export function POST(request: Request, ctx: Ctx) {
  return handle(async () => {
    const { type, slug } = await ctx.params;
    const b = await readJson(request, z.object({ finding: findingInput, sessionId: sessionSchema }));
    const { session } = resolveSession(typeParam(type), slug, b.sessionId);
    return Response.json({ sessionId: session.id, finding: addFinding(session.id, b.finding) });
  });
}

export function PUT(request: Request, ctx: Ctx) {
  return handle(async () => {
    const { type, slug } = await ctx.params;
    const b = await readJson(request, z.object({ id: z.string().max(40), finding: findingInput, sessionId: sessionSchema }));
    const { session } = resolveSession(typeParam(type), slug, b.sessionId);
    return Response.json({ sessionId: session.id, finding: editFinding(session.id, b.id, b.finding) });
  });
}

export function DELETE(request: Request, ctx: Ctx) {
  return handle(async () => {
    const { type, slug } = await ctx.params;
    const b = await readJson(request, z.object({ id: z.string().max(40), sessionId: sessionSchema }));
    const { session } = resolveSession(typeParam(type), slug, b.sessionId);
    removeFinding(session.id, b.id);
    return Response.json({ ok: true });
  });
}
