/**
 * Guards the local API against other websites in the user's browser:
 * - DNS rebinding: the Host header must be a loopback name (or one listed in SWEMOCK_ALLOWED_HOSTS).
 * - CSRF: state-changing requests must be same-origin and send JSON (which forces a CORS preflight).
 * Pure function so it can be unit-tested; wired up in src/proxy.ts.
 */
export interface GuardInput {
  method: string;
  host: string | null;
  origin: string | null;
  contentType: string | null;
  allowedHosts?: string[];
}

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostname(hostHeader: string): string {
  // Keep bracketed IPv6 literals intact; strip a trailing :port.
  const m = /^(\[[^\]]+\]|[^:]+)(?::\d+)?$/.exec(hostHeader.trim().toLowerCase());
  return m?.[1] ?? "";
}

export function checkApiRequest(input: GuardInput): { ok: true } | { ok: false; status: number; reason: string } {
  const allowed = [...LOOPBACK, ...(input.allowedHosts ?? []).map((h) => h.toLowerCase())];
  if (!input.host || !allowed.includes(hostname(input.host))) {
    return { ok: false, status: 403, reason: "Host not allowed" };
  }
  if (SAFE_METHODS.has(input.method.toUpperCase())) return { ok: true };

  if (input.origin) {
    let originHost: string;
    try {
      originHost = new URL(input.origin).host.toLowerCase();
    } catch {
      return { ok: false, status: 403, reason: "Bad origin" };
    }
    if (originHost !== input.host.trim().toLowerCase()) {
      return { ok: false, status: 403, reason: "Cross-origin request" };
    }
  }
  const type = (input.contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json" && type !== "multipart/form-data") {
    return { ok: false, status: 415, reason: "Expected application/json" };
  }
  return { ok: true };
}

export function allowedHostsFromEnv(value = process.env.SWEMOCK_ALLOWED_HOSTS): string[] {
  return (value ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
}
