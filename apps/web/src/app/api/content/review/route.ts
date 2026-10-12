import { z } from "zod";
import { ApiError, handle, readJson } from "@/server/http/errors";
import { approveItem } from "@/server/content/repo";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handle(async () => {
    const { id } = await readJson(request, z.object({ id: z.string().min(1).max(200) }));
    if (!approveItem(id)) throw new ApiError(404, "Unknown item.");
    return Response.json({ ok: true });
  });
}
