import "server-only";
import fs from "node:fs";
import path from "node:path";
import { promptsDir } from "../config";

export interface Template {
  /** Front matter: id, version, kind, description, … */
  meta: Record<string, string>;
  body: string;
  /** "<id>@<version>", stored with scorecards and packet events so results stay comparable. */
  versionTag: string;
}

/** Splits `---` front matter (simple `key: value` lines) from the body. */
export function parseTemplate(text: string): { meta: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split("\n")) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line.trim());
    if (kv) meta[kv[1]!] = kv[2]!;
  }
  return { meta, body: m[2]! };
}

export function loadTemplate(relPath: string): Template {
  const text = fs.readFileSync(path.join(promptsDir(), relPath), "utf8");
  const { meta, body } = parseTemplate(text);
  return { meta, body, versionTag: `${meta.id ?? relPath}@${meta.version ?? "0"}` };
}

/** Replaces every `{{name}}`. A placeholder without a value is a bug in the caller, so it throws. */
export function render(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!(name in vars)) throw new Error(`Template variable {{${name}}} has no value`);
    return vars[name]!;
  });
}
