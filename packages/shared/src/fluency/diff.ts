/**
 * Line diffs split into hunks, so an assistant's proposed file can be reviewed change by change
 * (accept or reject each hunk). Pure and shared by the server (logging, mutation) and the browser (preview).
 */
export interface Hunk {
  /** "h1", "h2", … in file order. */
  id: string;
  /** 1-based line of the original where the change starts (for an insertion: the line it goes before). */
  oldStart: number;
  oldLines: string[];
  newLines: string[];
}

const MAX_CELLS = 3_000_000;

/** The changes that turn `oldText` into `newText`, as hunks of consecutive replaced/added/removed lines. */
export function computeHunks(oldText: string, newText: string): Hunk[] {
  if (oldText === newText) return [];
  const a = oldText.split("\n");
  const b = newText.split("\n");
  if (a.length * b.length > MAX_CELLS) return [{ id: "h1", oldStart: 1, oldLines: a, newLines: b }];

  const dp: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  }
  const hunks: Hunk[] = [];
  let i = 0;
  let j = 0;
  let current: Hunk | null = null;
  const flush = () => {
    if (current) {
      current.id = `h${hunks.length + 1}`;
      hunks.push(current);
      current = null;
    }
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush();
      i++;
      j++;
      continue;
    }
    current ??= { id: "", oldStart: i + 1, oldLines: [], newLines: [] };
    if (j < b.length && (i >= a.length || dp[i]![j + 1]! >= dp[i + 1]![j]!)) current.newLines.push(b[j++]!);
    else current.oldLines.push(a[i++]!);
  }
  flush();
  return hunks;
}

/** Applies the hunks whose ids are in `accepted` to the original text; the rest are left as they were. */
export function applyHunks(oldText: string, hunks: Hunk[], accepted: ReadonlySet<string>): string {
  const lines = oldText.split("\n");
  const out: string[] = [];
  let at = 0; // index into `lines`
  for (const h of [...hunks].sort((x, y) => x.oldStart - y.oldStart)) {
    const start = h.oldStart - 1;
    out.push(...lines.slice(at, start));
    if (accepted.has(h.id)) out.push(...h.newLines);
    else out.push(...h.oldLines);
    at = start + h.oldLines.length;
  }
  out.push(...lines.slice(at));
  return out.join("\n");
}

/** Added and removed line counts of a set of hunks. */
export function hunkStats(hunks: Hunk[]): { added: number; removed: number } {
  return { added: hunks.reduce((n, h) => n + h.newLines.length, 0), removed: hunks.reduce((n, h) => n + h.oldLines.length, 0) };
}

/** Line numbers (1-based, in the new text) touched by the given hunks of `oldText → newText`. */
export function changedNewLines(oldText: string, newText: string): Set<number> {
  const out = new Set<number>();
  let delta = 0;
  for (const h of computeHunks(oldText, newText)) {
    const start = h.oldStart + delta;
    for (let k = 0; k < h.newLines.length; k++) out.add(start + k);
    delta += h.newLines.length - h.oldLines.length;
  }
  return out;
}
