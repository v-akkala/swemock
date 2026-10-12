import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { gradeFundamentalsQuestion } from "@/server/interview/engine";

export const dynamic = "force-dynamic";

/** Recruiter screen: the candidate's own call on the question whose key points are on screen. */
export function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { questionId, grade } = await readJson(request, z.object({ questionId: z.string().min(1).max(100), grade: z.union([z.literal(0), z.literal(1), z.literal(2)]) }));
    gradeFundamentalsQuestion(id, questionId, grade);
    return Response.json({ ok: true });
  });
}
