import type { Settings, SettingsPatch } from "@swemock/shared";

export async function patchSettings(patch: SettingsPatch): Promise<Settings> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Saving settings failed (${res.status})`);
  return (await res.json()) as Settings;
}
