import { handle, readJson } from "@/server/http/errors";
import { codeBodySchema } from "@/server/dsa/schemas";
import { runCode } from "@/server/dsa/service";

export const dynamic = "force-dynamic";

export function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await ctx.params;
    return Response.json(await runCode({ slug, ...(await readJson(request, codeBodySchema)) }));
  });
}
