import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { candidateSays, requireActive } from "@/server/interview/engine";
import { interviewerReply } from "@/server/interview/llm";

export const dynamic = "force-dynamic";

const body = z.object({
  text: z.string().trim().min(1).max(8000),
  /** How the answer was given (voice input only reports itself here). */
  meta: z.object({ voice: z.boolean().optional(), speechMs: z.number().int().min(0).max(3_600_000).optional() }).strict().optional(),
});

/**
 * The candidate's chat message. With the scripted interviewer the reply is ready immediately (JSON);
 * with the AI interviewer the reply streams back as server-sent events: delta, replace, done, error.
 */
export function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { text, meta } = await readJson(request, body);
    const { session, state } = requireActive(id);
    if (session.driver !== "llm" || state.liveVia !== "app") {
      candidateSays(id, text, Date.now(), meta ?? {});
      return Response.json({ ok: true });
    }
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of interviewerReply(id, text, request.signal, meta ?? {})) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : "The interviewer failed.";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", kind: "unavailable", message })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
  });
}
