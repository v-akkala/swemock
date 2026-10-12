import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { PACKET_KINDS, pasteReply } from "@/server/packets";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handle(async () => {
    const b = await readJson(request, z.object({ sessionId: z.string().max(40), kind: z.enum(PACKET_KINDS), text: z.string().max(200_000) }));
    return Response.json(pasteReply(b.sessionId, b.kind, b.text));
  });
}
