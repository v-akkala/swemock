import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { addEvent } from "@/server/dsa/store";
import { requireActive } from "@/server/interview/engine";
import { setDriver, writeState } from "@/server/interview/state";

export const dynamic = "force-dynamic";

/**
 * When the AI interviewer fails (spec §12), the candidate can switch this interview to the scripted
 * interviewer, or to running the conversation in another chat with the live packet.
 */
export function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { to } = await readJson(request, z.object({ to: z.enum(["scripted", "packet"]) }));
    const { state } = requireActive(id);
    setDriver(id, "scripted");
    if (to === "packet") {
      state.liveVia = "packet";
      writeState(id, state);
    }
    addEvent(id, "chat", {
      from: "system",
      text: to === "packet" ? "Switched to copy-prompt: continue the conversation in another chat with the live packet." : "Switched to the scripted interviewer.",
      phase: state.phases[state.phaseIndex]!.id,
    });
    return Response.json({ ok: true });
  });
}
