"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RunnerHealth } from "@swemock/shared";
import { cn } from "@/lib/utils";

/** Header indicator for the code-execution judge. Polls every 30s. */
export function RunnerStatus() {
  const [status, setStatus] = useState<RunnerHealth | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/runner/status")
        .then((r) => r.json() as Promise<RunnerHealth>)
        .then((s) => alive && setStatus(s))
        .catch(() => alive && setStatus(null));
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const label = status === null ? "Judge: checking…" : status.ok ? "Judge: ready" : `Judge unavailable: ${status.error ?? "unknown error"}`;
  return (
    <Link href="/settings#judge" title={label} aria-label={label} className="hover:bg-muted flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
      <span
        aria-hidden
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          status === null ? "bg-muted-foreground" : status.ok ? "bg-emerald-500" : "bg-red-500",
        )}
      />
      <span className="text-muted-foreground hidden sm:inline">Judge</span>
    </Link>
  );
}
