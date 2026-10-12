import { DEFAULT_MODELS } from "@swemock/shared";
import { fakeProviderEnabled, keyHints, resolveAi } from "@/server/ai/config";
import { handle } from "@/server/http/errors";

export const dynamic = "force-dynamic";

/** Effective AI configuration for the UI. Keys appear only as masked hints. */
export function GET() {
  return handle(() => Response.json({ ...resolveAi(), keys: keyHints(), defaults: DEFAULT_MODELS, fakeEnabled: fakeProviderEnabled() }));
}
