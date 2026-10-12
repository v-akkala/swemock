import { z } from "zod";
import { KEY_NAMES } from "@/server/ai/config";
import { deleteSecret, maskSecret, setSecret } from "@/server/crypto/secrets";
import { handle, readJson } from "@/server/http/errors";

export const dynamic = "force-dynamic";

const provider = z.enum(["anthropic", "openai-compatible"]);

/** Stores an API key encrypted at rest. The response carries only a masked hint. */
export function PUT(request: Request) {
  return handle(async () => {
    const body = await readJson(request, z.object({ provider, apiKey: z.string().trim().min(8).max(500) }));
    setSecret(KEY_NAMES[body.provider], body.apiKey);
    return Response.json({ ok: true, hint: maskSecret(body.apiKey) });
  });
}

export function DELETE(request: Request) {
  return handle(async () => {
    const body = await readJson(request, z.object({ provider }));
    deleteSecret(KEY_NAMES[body.provider]);
    return Response.json({ ok: true });
  });
}
