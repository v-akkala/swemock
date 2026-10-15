"use client";

import { Fragment, useMemo, useState } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { diffRows, type DiffRow } from "@/lib/diff-rows";
import type { FindingView } from "@/lib/fluency-types";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description: string;
  base: Record<string, string>;
  head: Record<string, string>;
  findings: FindingView[];
  /** Click on a line number of the new side: start a comment there. */
  onComment: (file: string, line: number) => void;
  onFix: () => void;
  decision: { value: string; summary: string } | null;
  onDecide: (value: "approve" | "request_changes" | "reject", summary: string) => Promise<void>;
}

const DECISIONS = [
  { value: "approve", label: "Approve" },
  { value: "request_changes", label: "Request changes" },
  { value: "reject", label: "Reject" },
] as const;

/** A GitHub-style pull request: description, unified or split diff with inline comments, and the final decision. */
export function PrView(props: Props) {
  const changed = useMemo(() => Object.keys(props.head).filter((p) => props.head[p] !== props.base[p]), [props.head, props.base]);
  const [mode, setMode] = useState<"unified" | "split">("unified");
  const [full, setFull] = useState<string | null>(null);
  const [value, setValue] = useState<string>(props.decision?.value ?? "");
  const [summary, setSummary] = useState(props.decision?.summary ?? "");
  const [saved, setSaved] = useState(Boolean(props.decision));

  return (
    <div className="h-full overflow-auto p-4 text-sm" data-testid="pr-view">
      <div className="mb-4 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{props.title}</h1>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">Open</span>
        </div>
        <p className="text-muted-foreground text-xs">opened by an AI agent · {changed.length} file{changed.length === 1 ? "" : "s"} changed</p>
        <div className="bg-card mt-2 rounded-md border border-border p-3" data-testid="pr-description">
          <Markdown>{props.description}</Markdown>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-semibold">Files changed</h2>
        <div className="ml-auto flex gap-1 text-xs" role="group" aria-label="Diff layout">
          {(["unified", "split"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={cn("rounded-md border border-border px-2 py-0.5", mode === m && "bg-muted font-medium")} data-testid={`diff-${m}`}>
              {m}
            </button>
          ))}
        </div>
        <Button variant="outline" className="h-7 text-xs" onClick={props.onFix} data-testid="fix-it">
          Fix it
        </Button>
      </div>

      {changed.map((file) => {
        const rows = diffRows(props.base[file] ?? "", props.head[file]!, full === file ? Infinity : 3);
        return (
          <section key={file} className="mb-5 rounded-md border border-border" data-testid={`diff-${file}`}>
            <div className="border-border bg-muted flex items-center gap-2 border-b px-3 py-1.5">
              <span className="font-mono text-xs">{file}</span>
              <button className="text-muted-foreground ml-auto text-xs underline" onClick={() => setFull(full === file ? null : file)}>
                {full === file ? "Show changes only" : "Show the full file"}
              </button>
            </div>
            {mode === "unified" ? <Unified rows={rows} file={file} findings={props.findings} onComment={props.onComment} /> : <Split rows={rows} file={file} findings={props.findings} onComment={props.onComment} />}
          </section>
        );
      })}

      <section className="bg-card mt-6 space-y-3 rounded-md border border-border p-4" data-testid="decision-form">
        <h2 className="font-semibold">Your review</h2>
        <div className="flex flex-wrap gap-4" role="radiogroup" aria-label="Decision">
          {DECISIONS.map((d) => (
            <label key={d.value} className="flex items-center gap-1.5">
              <input type="radio" name="decision" value={d.value} checked={value === d.value} onChange={() => (setValue(d.value), setSaved(false))} data-testid={`decision-${d.value}`} />
              {d.label}
            </label>
          ))}
        </div>
        <textarea value={summary} onChange={(e) => (setSummary(e.target.value), setSaved(false))} aria-label="Summary comment" placeholder="Summary comment: the reason for your decision, and what the author must change." className="bg-background h-24 w-full rounded-md border border-border p-2 text-sm" data-testid="decision-summary" />
        <div className="flex items-center gap-3">
          <Button
            disabled={!value}
            onClick={async () => {
              await props.onDecide(value as "approve", summary);
              setSaved(true);
            }}
            data-testid="submit-review"
          >
            Submit review
          </Button>
          {saved && value && <span className="text-muted-foreground text-xs" data-testid="review-saved">Review recorded.</span>}
        </div>
      </section>
    </div>
  );
}

const ROW_STYLE = { add: "bg-emerald-500/10", del: "bg-red-500/10", ctx: "", gap: "bg-muted/50 text-muted-foreground" } as const;

function Comments({ findings, file, line }: { findings: FindingView[]; file: string; line: number }) {
  const here = findings.filter((f) => f.file === file && f.lines[0] <= line && line <= f.lines[1] && f.lines[1] === line);
  if (!here.length) return null;
  return (
    <div className="space-y-1 border-y border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs" data-testid="inline-comment">
      {here.map((f) => (
        <p key={f.id}>
          <strong>
            {f.category} · {f.severity}
          </strong>
          {f.text ? `: ${f.text}` : ""}
        </p>
      ))}
    </div>
  );
}

function LineNo({ n, onClick, label }: { n: number | null; onClick?: () => void; label: string }) {
  return (
    <td className="text-muted-foreground w-12 select-none px-2 text-right align-top font-mono text-[11px]">
      {n !== null &&
        (onClick ? (
          <button type="button" onClick={onClick} className="hover:text-foreground underline-offset-2 hover:underline" aria-label={label} data-testid={`line-${n}`}>
            {n}
          </button>
        ) : (
          n
        ))}
    </td>
  );
}

function Unified({ rows, file, findings, onComment }: { rows: DiffRow[]; file: string; findings: FindingView[]; onComment: (file: string, line: number) => void }) {
  return (
    <table className="w-full border-collapse font-mono text-xs">
      <tbody>
        {rows.map((r, i) =>
          r.kind === "gap" ? (
            <tr key={i} className={ROW_STYLE.gap}>
              <td colSpan={4} className="px-3 py-0.5 text-center">
                … {r.hidden} unchanged line{r.hidden === 1 ? "" : "s"} …
              </td>
            </tr>
          ) : (
            <Fragment key={i}>
              <tr className={ROW_STYLE[r.kind]}>
                <LineNo n={r.oldNo} label="" />
                <LineNo n={r.newNo} label={`Comment on line ${r.newNo}`} onClick={r.newNo !== null && r.kind !== "del" ? () => onComment(file, r.newNo!) : undefined} />
                <td className="w-4 select-none text-center">{r.kind === "add" ? "+" : r.kind === "del" ? "−" : ""}</td>
                <td className="whitespace-pre-wrap break-all pr-3">{r.text}</td>
              </tr>
              {r.newNo !== null && (
                <tr>
                  <td colSpan={4} className="p-0">
                    <Comments findings={findings} file={file} line={r.newNo} />
                  </td>
                </tr>
              )}
            </Fragment>
          ),
        )}
      </tbody>
    </table>
  );
}

function Split({ rows, file, findings, onComment }: { rows: DiffRow[]; file: string; findings: FindingView[]; onComment: (file: string, line: number) => void }) {
  // Pair deletions with the additions that follow them.
  const pairs: { left: DiffRow | null; right: DiffRow | null; gap?: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.kind === "gap") pairs.push({ left: null, right: null, gap: r.hidden });
    else if (r.kind === "ctx") pairs.push({ left: r, right: r });
    else if (r.kind === "del") {
      const dels: DiffRow[] = [];
      while (rows[i]?.kind === "del") dels.push(rows[i++]!);
      const adds: DiffRow[] = [];
      while (rows[i]?.kind === "add") adds.push(rows[i++]!);
      i--;
      for (let k = 0; k < Math.max(dels.length, adds.length); k++) pairs.push({ left: dels[k] ?? null, right: adds[k] ?? null });
    } else pairs.push({ left: null, right: r });
  }
  return (
    <table className="w-full table-fixed border-collapse font-mono text-xs">
      <tbody>
        {pairs.map((p, i) =>
          p.gap ? (
            <tr key={i} className={ROW_STYLE.gap}>
              <td colSpan={4} className="px-3 py-0.5 text-center">
                … {p.gap} unchanged lines …
              </td>
            </tr>
          ) : (
            <Fragment key={i}>
              <tr>
                <LineNo n={p.left?.oldNo ?? null} label="" />
                <td className={cn("w-1/2 whitespace-pre-wrap break-all pr-2", p.left?.kind === "del" && ROW_STYLE.del)}>{p.left?.text}</td>
                <LineNo n={p.right?.newNo ?? null} label={`Comment on line ${p.right?.newNo}`} onClick={p.right?.newNo != null && p.right.kind !== "del" ? () => onComment(file, p.right!.newNo!) : undefined} />
                <td className={cn("w-1/2 whitespace-pre-wrap break-all pr-2", p.right?.kind === "add" && ROW_STYLE.add)}>{p.right?.text}</td>
              </tr>
              {p.right?.newNo != null && (
                <tr>
                  <td colSpan={4} className="p-0">
                    <Comments findings={findings} file={file} line={p.right.newNo} />
                  </td>
                </tr>
              )}
            </Fragment>
          ),
        )}
      </tbody>
    </table>
  );
}
