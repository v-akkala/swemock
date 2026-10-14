import fs from "node:fs";
import path from "node:path";
import { SLUG_RE } from "@swemock/content";

const TEMPLATES = path.resolve(import.meta.dirname, "../templates");

function titleFromSlug(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type ScaffoldType = "dsa" | "cs" | "behavioral" | "lld";

export function scaffold(type: ScaffoldType, contentRoot: string, slug: string, opts: { title?: string; difficulty?: string }): string {
  if (!SLUG_RE.test(slug)) throw new Error(`"${slug}" is not a valid slug: use lowercase words separated by hyphens`);
  const dest = path.join(contentRoot, type, slug);
  if (fs.existsSync(dest)) throw new Error(`${path.relative(process.cwd(), dest)} already exists`);
  const vars: Record<string, string> = {
    __SLUG__: slug,
    __TITLE__: opts.title ?? titleFromSlug(slug),
    __DIFFICULTY__: opts.difficulty ?? "easy",
  };
  const copy = (from: string, to: string) => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      if (e.isDirectory()) copy(path.join(from, e.name), path.join(to, e.name));
      else {
        let text = fs.readFileSync(path.join(from, e.name), "utf8");
        for (const [k, v] of Object.entries(vars)) text = text.split(k).join(v);
        fs.writeFileSync(path.join(to, e.name), text);
      }
    }
  };
  copy(path.join(TEMPLATES, type), dest);
  return dest;
}

export const scaffoldDsa = (contentRoot: string, slug: string, opts: { title?: string; difficulty?: string }) => scaffold("dsa", contentRoot, slug, opts);
