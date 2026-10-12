import { MODEL_ROLES } from "@swemock/shared";
import { getProvider, resolveAi } from "@/server/ai/config";
import { handle } from "@/server/http/errors";

export const dynamic = "force-dynamic";

/** "Test connection" for the saved configuration: credentials work and the models exist. */
export function POST() {
  return handle(async () => {
    const resolved = resolveAi();
    if (!resolved.connected) return Response.json({ ok: false, detail: resolved.problem });
    const result = await getProvider(resolved).testConnection(MODEL_ROLES.map((r) => resolved.models[r]));
    return Response.json(result);
  });
}
