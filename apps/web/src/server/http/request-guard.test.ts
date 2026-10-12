import { describe, expect, it } from "vitest";
import { allowedHostsFromEnv, checkApiRequest } from "./request-guard";

const base = { method: "POST", host: "localhost:3000", origin: "http://localhost:3000", contentType: "application/json" };

describe("checkApiRequest", () => {
  it("allows same-origin JSON writes from loopback hosts", () => {
    expect(checkApiRequest(base).ok).toBe(true);
    expect(checkApiRequest({ ...base, host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }).ok).toBe(true);
    expect(checkApiRequest({ ...base, host: "[::1]:3000", origin: "http://[::1]:3000" }).ok).toBe(true);
  });

  it("allows reads without origin or content type", () => {
    expect(checkApiRequest({ method: "GET", host: "localhost:3000", origin: null, contentType: null }).ok).toBe(true);
  });

  it("blocks DNS-rebinding hosts, even for reads", () => {
    expect(checkApiRequest({ ...base, method: "GET", host: "evil.example:3000" }).ok).toBe(false);
    expect(checkApiRequest({ ...base, host: null }).ok).toBe(false);
  });

  it("blocks cross-origin writes and non-JSON writes", () => {
    expect(checkApiRequest({ ...base, origin: "http://evil.example" }).ok).toBe(false);
    expect(checkApiRequest({ ...base, origin: "http://localhost:4000" }).ok).toBe(false);
    expect(checkApiRequest({ ...base, contentType: "text/plain" }).ok).toBe(false);
    expect(checkApiRequest({ ...base, contentType: "application/x-www-form-urlencoded" }).ok).toBe(false);
  });

  it("honours extra allowed hosts", () => {
    const input = { ...base, host: "mybox.lan:3000", origin: "http://mybox.lan:3000" };
    expect(checkApiRequest(input).ok).toBe(false);
    expect(checkApiRequest({ ...input, allowedHosts: allowedHostsFromEnv("mybox.lan, other") }).ok).toBe(true);
  });
});
