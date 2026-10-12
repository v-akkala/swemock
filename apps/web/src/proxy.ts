import { NextResponse, type NextRequest } from "next/server";
import { allowedHostsFromEnv, checkApiRequest } from "@/server/http/request-guard";

export function proxy(request: NextRequest) {
  const result = checkApiRequest({
    method: request.method,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    contentType: request.headers.get("content-type"),
    allowedHosts: allowedHostsFromEnv(),
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
