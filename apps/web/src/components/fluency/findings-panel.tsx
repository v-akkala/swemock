"use client";

import { useState } from "react";
import { FINDING_CATEGORIES, SEVERITIES } from "@swemock/shared";
import { Button } from "@/components/ui/button";
import type { FindingView } from "@/lib/fluency-types";
import { cn } from "@/lib/utils";

export interface Draft {
  file: string;
  from: number;
  to: number;
}

export type FindingFields = { file: string; lines: [number, number]; category: string; severity: string; text: string };

const SEVERITY_STYLE: Record<string, string> = {
  low: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  critical: "bg-red-500/15 text-red-700 dark:text-red-300",
};

/** The list of findings (gutter annotations or PR comments) and the form for a new one. */
export function FindingsPanel({
  findings,
  draft,
  onDraft,
  onSave,
  onRemove,
  onJump,
  noun,
}: {
  findings: FindingView[];
  draft: Draft | null;
  onDraft: (d: Draft | null) => void;
  onSave: (f: FindingFields) => Promise<void>;
  onRemove: (id: string) => void;
  onJump: (f: FindingView) => void;
  noun: "finding" | "comment";
}) {
  return (
    <div className="space-y-4 text-sm" data-testid="findings-panel">
      {draft ? (
        <FindingForm key={`${draft.file}:${draft.from}-${draft.to}`} draft={draft} noun={noun} onCancel={() => onDraft(null)} onSave={onSave} />
      ) : (
        <p className="text-muted-foreground text-xs">
          Select lines in the editor{noun === "comment" ? " (or click a line number in the diff)" : ""} and press &ldquo;Add {noun}&rdquo;. Each one has a category and a severity.
        </p>
      )}
      <ul className="space-y-2" data-testid="findings-list">
        {findings.map((f) => (
          <li key={f.id} className="rounded-md border border-border p-2" data-testid="finding">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button type="button" className="font-mono underline" onClick={() => onJump(f)}>
                {f.file}:{f.lines[0]}
                {f.lines[1] !== f.lines[0] ? `-${f.lines[1]}` : ""}
              </button>
              <span className="bg-muted rounded px-1.5 py-0.5">{f.category}</span>
              <span className={cn("rounded px-1.5 py-0.5", SEVERITY_STYLE[f.severity])}>{f.severity}</span>
              <button type="button" className="text-muted-foreground ml-auto hover:underline" onClick={() => onRemove(f.id)}>
                Remove
              </button>
            </div>
            {f.text && <p className="mt-1 whitespace-pre-wrap text-xs">{f.text}</p>}
          </li>
        ))}
        {findings.length === 0 && <li className="text-muted-foreground text-xs">No {noun}s yet.</li>}
      </ul>
    </div>
  );
}

function FindingForm({ draft, noun, onCancel, onSave }: { draft: Draft; noun: string; onCancel: () => void; onSave: (f: FindingFields) => Promise<void> }) {
  const [category, setCategory] = useState<string>("logic-error");
  const [severity, setSeverity] = useState<string>("medium");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(draft.from);
  const [to, setTo] = useState(draft.to);
  const valid = Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= from;
  return (
    <form
      className="bg-card space-y-2 rounded-md border border-border p-3"
      data-testid="finding-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          if (valid) await onSave({ file: draft.file, lines: [from, to], category, severity, text });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <p className="font-mono">{draft.file}</p>
        <label className="block">
          From line
          <input type="number" min={1} value={Number.isNaN(from) ? "" : from} onChange={(e) => setFrom(e.target.valueAsNumber)} className="bg-background mt-0.5 block h-8 w-16 rounded-md border border-border px-1" data-testid="finding-from" />
        </label>
        <label className="block">
          To line
          <input type="number" min={1} value={Number.isNaN(to) ? "" : to} onChange={(e) => setTo(e.target.valueAsNumber)} className="bg-background mt-0.5 block h-8 w-16 rounded-md border border-border px-1" data-testid="finding-to" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-background mt-0.5 h-8 w-full rounded-md border border-border px-1" data-testid="finding-category">
            {FINDING_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          Severity
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="bg-background mt-0.5 h-8 w-full rounded-md border border-border px-1" data-testid="finding-severity">
            {SEVERITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label={`Note for this ${noun}`} placeholder="What is wrong, and why does it matter?" className="bg-background h-16 w-full rounded-md border border-border p-2 text-xs" data-testid="finding-text" />
      <div className="flex gap-2">
        <Button type="submit" className="h-7 text-xs" disabled={busy || !valid} data-testid="save-finding">
          Save {noun}
        </Button>
        <Button type="button" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
