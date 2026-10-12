/** A small line diff (LCS) for showing the interviewer what changed in the candidate's code. */
export function lineDiff(before: string, after: string, maxChars = 2500): string {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length * b.length > 400 * 400) return truncate(`(large change; current code)\n${after}`, maxChars);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || dp[i]![j + 1]! >= dp[i + 1]![j]!)) out.push(`+ ${b[j++]}`);
    else out.push(`- ${a[i++]}`);
  }
  return truncate(out.join("\n"), maxChars);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}\n… (truncated)`;
}
