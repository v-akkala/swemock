import "server-only";
import { loadTemplate, render } from "../../prompts/templates";

/**
 * Scripted-interviewer text lives in prompts/interviewer/*.md: "## section" headings with "- line" items.
 * Placeholders are filled from `vars`.
 */
export function scriptSections(relPath: string, vars: Record<string, string> = {}): { lines: Record<string, string[]>; versionTag: string } {
  const t = loadTemplate(relPath);
  const lines: Record<string, string[]> = {};
  let current: string | null = null;
  for (const raw of render(t.body, vars).split("\n")) {
    const heading = /^##\s+(\w+)/.exec(raw);
    if (heading) {
      current = heading[1]!;
      lines[current] = [];
    } else if (current && raw.startsWith("- ")) lines[current]!.push(raw.slice(2).trim());
  }
  return { lines, versionTag: t.versionTag };
}
