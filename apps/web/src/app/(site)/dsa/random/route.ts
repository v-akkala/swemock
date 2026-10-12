import { NextResponse, type NextRequest } from "next/server";
import { listDsa } from "@/server/content/repo";

export const dynamic = "force-dynamic";

/** "Random unsolved medium graph problem": picks uniformly among the problems matching the filters. */
export function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const matches = listDsa({
    tag: p.get("tag") || undefined,
    difficulty: p.get("difficulty") || undefined,
    status: p.get("status") || undefined,
    company: p.get("company") || undefined,
    q: p.get("q") || undefined,
  });
  const target = matches.length ? `/dsa/${matches[Math.floor(Math.random() * matches.length)]!.slug}` : "/dsa";
  return NextResponse.redirect(new URL(target, request.url));
}
