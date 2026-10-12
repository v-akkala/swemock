import type { Settings, SettingsPatch } from "@swemock/shared";

/** Calls a JSON API; throws an Error carrying the server's message on failure. */
export async function api<T>(url: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the app. Is it still running?");
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export function patchSettings(patch: SettingsPatch): Promise<Settings> {
  return api<Settings>("/api/settings", "PATCH", patch);
}
