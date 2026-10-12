import { handle } from "@/server/http/errors";
import { gradeWithAi } from "@/server/packets";

export const dynamic = "force-dynamic";

export function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => Response.json(await gradeWithAi((await ctx.params).id)));
}
