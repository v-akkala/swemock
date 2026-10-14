import { ApiError, handle } from "@/server/http/errors";
import { getSession } from "@/server/dsa/store";
import { startInterview } from "@/server/interview/engine";
import { startBehavioral } from "@/server/interview/rounds/behavioral";
import { startLldInterview } from "@/server/interview/rounds/lld";
import { startRecruiter } from "@/server/interview/rounds/recruiter";
import { readState } from "@/server/interview/state";

export const dynamic = "force-dynamic";

/** Start the same interview again: same problem, resume and role, or questions, with the same kind of interviewer. */
export function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = getSession((await ctx.params).id);
    if (!session || session.mode !== "interview") throw new ApiError(404, "Unknown interview.");
    const state = readState(session);
    const common = { driver: session.driver, liveVia: state.liveVia };
    const round = state.round;
    if (round?.kind === "recruiter") {
      const c = round.config;
      return Response.json({ id: startRecruiter({ ...common, resumeText: c.resumeText, resumeTitle: c.resumeTitle, role: c.role, company: c.company, jobDescription: c.jobDescription }).id });
    }
    if (round?.kind === "behavioral") {
      return Response.json({ id: startBehavioral({ ...common, questionIds: round.config.questionIds, lens: round.config.lens }).id });
    }
    if (round?.kind === "lld") return Response.json({ id: startLldInterview({ slug: round.slug, ...common }).id });
    if (!session.itemId) throw new ApiError(404, "Unknown interview.");
    return Response.json({ id: startInterview({ slug: session.itemId.split(":")[1]!, ...common }).id });
  });
}
