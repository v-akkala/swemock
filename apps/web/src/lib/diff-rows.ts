import { computeHunks } from "@swemock/shared";

export interface DiffRow {
  kind: "ctx" | "add" | "del" | "gap";
  oldNo: number | null;
  newNo: number | null;
  text: string;
  /** For a gap: how many unchanged lines it hides. */
  hidden?: number;
}

/** Unified-diff rows for a file, with `context` unchanged lines around each change (Infinity = the whole file). */
export function diffRows(oldText: string, newText: string, context = 3): DiffRow[] {
  const oldLines = oldText === "" ? [] : oldText.split("\n");
  const full: DiffRow[] = [];
  let o = 1;
  let n = 1;
  for (const h of computeHunks(oldText, newText)) {
    while (o < h.oldStart) full.push({ kind: "ctx", oldNo: o, newNo: n++, text: oldLines[o++ - 1]! });
    for (const l of h.oldLines) full.push({ kind: "del", oldNo: o++, newNo: null, text: l });
    for (const l of h.newLines) full.push({ kind: "add", oldNo: null, newNo: n++, text: l });
  }
  while (o <= oldLines.length) full.push({ kind: "ctx", oldNo: o, newNo: n++, text: oldLines[o++ - 1]! });
  if (!Number.isFinite(context)) return full;

  const keep = new Array<boolean>(full.length).fill(false);
  full.forEach((r, i) => {
    if (r.kind === "ctx") return;
    for (let k = Math.max(0, i - context); k <= Math.min(full.length - 1, i + context); k++) keep[k] = true;
  });
  const out: DiffRow[] = [];
  let skipped = 0;
  full.forEach((r, i) => {
    if (keep[i]) {
      if (skipped) out.push({ kind: "gap", oldNo: null, newNo: null, text: "", hidden: skipped });
      skipped = 0;
      out.push(r);
    } else skipped++;
  });
  if (skipped && out.length) out.push({ kind: "gap", oldNo: null, newNo: null, text: "", hidden: skipped });
  return out;
}
