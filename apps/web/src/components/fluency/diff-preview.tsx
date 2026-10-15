"use client";

import { useState } from "react";
import { applyHunks, computeHunks } from "@swemock/shared";
import { Button } from "@/components/ui/button";
import type { Proposal } from "@/lib/fluency-types";
import { cn } from "@/lib/utils";

interface Props {
  proposals: Proposal[];
  /** The workspace's current files: hunks are computed against what is in the editor now. */
  files: Record<string, string>;
  /** Called with the new file contents and what was accepted and rejected (for the log). */
  onApply: (path: string, newText: string, proposalId: string, accepted: string[], rejected: string[]) => void;
  onDismiss: (proposalId: string) => void;
}

/** The diff preview for assistant-proposed code: accept or reject each hunk (spec §8.4). */
export function DiffPreview({ proposals, files, onApply, onDismiss }: Props) {
  return (
    <div className="space-y-4" data-testid="diff-preview">
      {proposals.map((p) => (
        <ProposalView key={p.id} proposal={p} current={files[p.path] ?? ""} onApply={onApply} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ProposalView({ proposal, current, onApply, onDismiss }: { proposal: Proposal; current: string } & Pick<Props, "onApply" | "onDismiss">) {
  const hunks = computeHunks(current, proposal.newContent);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const accepted = (id: string) => picked[id] ?? true;

  if (hunks.length === 0) {
    return (
      <div className="rounded-md border border-border p-3 text-sm">
        <p className="font-mono text-xs">{proposal.path}</p>
        <p className="text-muted-foreground mt-1 text-xs">The assistant&apos;s version is identical to what is in the editor.</p>
        <Button variant="ghost" className="mt-2 h-7 text-xs" onClick={() => onDismiss(proposal.id)}>
          Dismiss
        </Button>
      </div>
    );
  }

  function apply() {
    const ok = new Set(hunks.filter((h) => accepted(h.id)).map((h) => h.id));
    onApply(proposal.path, applyHunks(current, hunks, ok), proposal.id, [...ok], hunks.filter((h) => !ok.has(h.id)).map((h) => h.id));
  }

  return (
    <div className="rounded-md border border-border text-sm" data-testid={`proposal-${proposal.id}`}>
      <div className="border-border flex items-center gap-2 border-b px-3 py-1.5">
        <span className="font-mono text-xs">{proposal.path}</span>
        <span className="text-muted-foreground text-xs">
          {hunks.length} change{hunks.length === 1 ? "" : "s"}
          {current === "" ? " (new file)" : ""}
        </span>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" className="h-7 text-xs" onClick={() => setPicked(Object.fromEntries(hunks.map((h) => [h.id, true])))}>
            Accept all
          </Button>
          <Button variant="ghost" className="h-7 text-xs" onClick={() => setPicked(Object.fromEntries(hunks.map((h) => [h.id, false])))}>
            Reject all
          </Button>
        </div>
      </div>
      <ol className="divide-border divide-y">
        {hunks.map((h) => (
          <li key={h.id} className="p-2" data-testid={`hunk-${h.id}`}>
            <label className="mb-1 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={accepted(h.id)} onChange={(e) => setPicked((x) => ({ ...x, [h.id]: e.target.checked }))} data-testid={`accept-${proposal.id}-${h.id}`} />
              <span className="font-medium">{h.oldLines.length === 0 ? "Add" : h.newLines.length === 0 ? "Remove" : "Change"} at line {h.oldStart}</span>
            </label>
            <pre className="bg-muted overflow-auto rounded p-2 font-mono text-xs">
              {h.oldLines.map((l, i) => (
                <div key={`o${i}`} className={cn("bg-red-500/10 text-red-700 dark:text-red-300")}>
                  - {l}
                </div>
              ))}
              {h.newLines.map((l, i) => (
                <div key={`n${i}`} className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  + {l}
                </div>
              ))}
            </pre>
          </li>
        ))}
      </ol>
      <div className="border-border flex gap-2 border-t p-2">
        <Button className="h-8" onClick={apply} data-testid={`apply-${proposal.id}`}>
          Apply selected
        </Button>
        <Button variant="ghost" className="h-8" onClick={() => onDismiss(proposal.id)}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
