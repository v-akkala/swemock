import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { PACKET_KINDS, renderPacket } from "@/server/packets";

export const dynamic = "force-dynamic";

const body = z.object({
  kind: z.enum(PACKET_KINDS),
  sessionId: z.string().max(40).optional(),
  slug: z.string().max(100).optional(),
  itemType: z.enum(["dsa", "lld"]).optional(),
  approach: z.string().max(8000).optional(),
});

export function POST(request: Request) {
  return handle(async () => Response.json(renderPacket(await readJson(request, body))));
}
