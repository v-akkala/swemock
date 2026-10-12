import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { PACKET_KINDS, logPacketAction } from "@/server/packets";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handle(async () => {
    const b = await readJson(
      request,
      z.object({ sessionId: z.string().max(40), kind: z.enum(PACKET_KINDS), action: z.enum(["copy", "download"]), version: z.string().max(80) }),
    );
    logPacketAction(b.sessionId, b.kind, b.action, b.version);
    return Response.json({ ok: true });
  });
}
