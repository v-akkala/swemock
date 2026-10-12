import { handle, readJson } from "@/server/http/errors";
import { deleteStory, saveStory, storyInputSchema } from "@/server/stories";

export const dynamic = "force-dynamic";

export function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    return Response.json(saveStory(await readJson(request, storyInputSchema), id));
  });
}

export function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    deleteStory((await ctx.params).id);
    return Response.json({ ok: true });
  });
}
