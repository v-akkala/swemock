import { z } from "zod";
import { LANGUAGES } from "@swemock/shared";
import { handle, readJson } from "@/server/http/errors";
import { runLld } from "@/server/lld/service";

export const dynamic = "force-dynamic";

const body = z.object({ language: z.enum(LANGUAGES), files: z.record(z.string().max(200), z.string().max(200_000)).refine((f) => Object.keys(f).length <= 8, "too many files"), sessionId: z.string().max(40).optional() });

export function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await ctx.params;
    return Response.json(await runLld({ slug, ...(await readJson(request, body)) }));
  });
}
