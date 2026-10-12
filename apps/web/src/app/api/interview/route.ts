import { z } from "zod";
import { resolveAi } from "@/server/ai/config";
import { ApiError, handle, readJson } from "@/server/http/errors";
import { startInterview } from "@/server/interview/engine";

export const dynamic = "force-dynamic";

const body = z.object({
  slug: z.string().min(1).max(100),
  /** ai: the configured model interviews; scripted: no AI; packet: the interview runs in another chat. */
  interviewer: z.enum(["ai", "scripted", "packet"]),
});

export function POST(request: Request) {
  return handle(async () => {
    const { slug, interviewer } = await readJson(request, body);
    if (interviewer === "ai" && !resolveAi().connected) throw new ApiError(409, resolveAi().problem ?? "No AI provider is configured.");
    const session = startInterview({
      slug,
      driver: interviewer === "ai" ? "llm" : "scripted",
      liveVia: interviewer === "packet" ? "packet" : "app",
    });
    return Response.json({ id: session.id });
  });
}
