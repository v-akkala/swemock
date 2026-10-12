import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { OA_DURATIONS, OA_MIXES, createOa } from "@/server/dsa/oa";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  durationMin: z.number().refine((n) => (OA_DURATIONS as readonly number[]).includes(n), "Pick 70, 80, or 90 minutes."),
  mix: z.enum(Object.keys(OA_MIXES) as [keyof typeof OA_MIXES, ...(keyof typeof OA_MIXES)[]]),
});

export function POST(request: Request) {
  return handle(async () => {
    const session = createOa(await readJson(request, bodySchema));
    return Response.json({ id: session.id });
  });
}
