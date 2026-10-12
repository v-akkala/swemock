import { z } from "zod";
import { resolveAi } from "@/server/ai/config";
import { ApiError, handle, readJson } from "@/server/http/errors";
import { startInterview } from "@/server/interview/engine";
import { startBehavioral } from "@/server/interview/rounds/behavioral";
import { startRecruiter } from "@/server/interview/rounds/recruiter";
import { getResumeText } from "@/server/resume/store";

export const dynamic = "force-dynamic";

/** ai: the configured model interviews; scripted: no AI; packet: the interview runs in another chat. */
const interviewer = z.enum(["ai", "scripted", "packet"]);

const dsa = z.object({ round: z.literal("dsa").optional(), slug: z.string().min(1).max(100), interviewer });
const recruiter = z.object({
  round: z.literal("recruiter"),
  interviewer,
  resumeId: z.string().max(40).optional(),
  resumeText: z.string().max(40_000).optional(),
  role: z.string().trim().min(1).max(80),
  company: z.string().trim().max(80).default(""),
  jobDescription: z.string().trim().max(12_000).default(""),
});
const behavioral = z.object({
  round: z.literal("behavioral"),
  interviewer,
  count: z.number().int().min(4).max(6).default(5),
  lens: z.enum(["amazon", "google", "meta"]).nullable().default(null),
  focus: z.array(z.string().max(40)).max(16).default([]),
});

export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request, z.union([recruiter, behavioral, dsa]));
    if (body.interviewer === "ai" && !resolveAi().connected) throw new ApiError(409, resolveAi().problem ?? "No AI provider is configured.");
    const common = {
      driver: body.interviewer === "ai" ? ("llm" as const) : ("scripted" as const),
      liveVia: body.interviewer === "packet" ? ("packet" as const) : ("app" as const),
    };
    if (body.round === "recruiter") {
      const saved = body.resumeId ? getResumeText(body.resumeId) : null;
      if (body.resumeId && !saved) throw new ApiError(404, "That resume version doesn't exist.");
      const session = startRecruiter({
        ...common,
        resumeText: saved?.text ?? body.resumeText ?? "",
        resumeTitle: saved?.title,
        role: body.role,
        company: body.company,
        jobDescription: body.jobDescription,
      });
      return Response.json({ id: session.id });
    }
    if (body.round === "behavioral") {
      const session = startBehavioral({ ...common, count: body.count, lens: body.lens, focus: body.focus });
      return Response.json({ id: session.id });
    }
    return Response.json({ id: startInterview({ slug: body.slug, ...common }).id });
  });
}
