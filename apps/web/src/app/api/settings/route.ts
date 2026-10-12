import { settingsPatchSchema } from "@swemock/shared";
import { getDb } from "@/server/db";
import { readSettings, updateSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(readSettings(getDb()));
}

export async function PATCH(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = settingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid settings", issues: parsed.error.issues }, { status: 400 });
  }
  return Response.json(updateSettings(getDb(), parsed.data));
}
