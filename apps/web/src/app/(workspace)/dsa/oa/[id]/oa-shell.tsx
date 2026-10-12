"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProblemWorkspace, type WorkspaceProps } from "@/components/dsa/workspace";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface OaProblem {
  slug: string;
  workspace: WorkspaceProps;
}

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
}

export function OaShell({
  sessionId,
  deadline,
  serverNow,
  problems,
}: {
  sessionId: string;
  deadline: number;
  serverNow: number;
  problems: OaProblem[];
}) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  // The browser clock may differ from the server's; count down against the server's clock.
  const [offset] = useState(() => serverNow - Date.now());
  const [remaining, setRemaining] = useState(() => deadline - serverNow);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    const tick = () => {
      const left = deadline - (Date.now() + offset);
      setRemaining(left);
      if (left <= 0) router.refresh(); // the server settles the session and shows the results
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline, offset, router]);

  async function finish() {
    if (!window.confirm("Finish the assessment now? You can't change your answers afterwards.")) return;
    setFinishing(true);
    try {
      await api(`/api/dsa/oa/${sessionId}/finish`, "POST", {});
    } finally {
      router.refresh();
    }
  }

  const low = remaining < 5 * 60_000;
  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex shrink-0 items-center gap-3 border-b px-4 py-1.5">
        <div role="tablist" aria-label="Problems" className="flex gap-1">
          {problems.map((p, i) => (
            <button
              key={p.slug}
              role="tab"
              aria-selected={active === i}
              onClick={() => setActive(i)}
              className={cn("rounded-md px-3 py-1 text-sm", active === i ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {i + 1}. {p.workspace.title}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span
            role="timer"
            aria-label="Time remaining"
            className={cn("font-mono text-sm tabular-nums", low && "font-semibold text-red-600 dark:text-red-400")}
            data-testid="oa-timer"
          >
            {format(remaining)}
          </span>
          <Button variant="outline" onClick={finish} disabled={finishing} data-testid="finish-oa">
            Finish
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {problems.map((p, i) => (
          <div key={p.slug} hidden={active !== i} className="h-full">
            <ProblemWorkspace {...p.workspace} />
          </div>
        ))}
      </div>
    </div>
  );
}
