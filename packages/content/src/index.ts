import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ContentError, loadDsaItem, toPrivate, toPublic, type LoadedDsa } from "./dsa/load";
import {
  behavioralPrivate,
  behavioralPublic,
  csPrivate,
  csPublic,
  loadBehavioralItem,
  loadCsItem,
  type LoadedBehavioral,
  type LoadedCs,
} from "./question/load";

export * from "./dsa/manifest";
export * from "./dsa/load";
export * from "./question/manifest";
export * from "./question/load";

export type ContentItem = LoadedDsa | LoadedCs | LoadedBehavioral;

/** One folder per item under content/<type>/. Adding a type: a loader, a public/private split, and a line here. */
export const CONTENT_TYPES = ["dsa", "cs", "behavioral"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

const LOADERS: Record<ContentType, (dir: string) => ContentItem> = {
  dsa: loadDsaItem,
  cs: loadCsItem,
  behavioral: loadBehavioralItem,
};

/** Every file under `dir` (relative paths, sorted), skipping dotfiles and editor junk. */
export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "__pycache__" || entry.name.endsWith("~")) continue;
      const next = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (entry.isFile()) out.push(next);
    }
  };
  walk("");
  return out.sort();
}

/** Hash of every file's path and bytes: changes whenever anything in the item changes. */
export function hashItemDir(dir: string): string {
  const h = crypto.createHash("sha256");
  for (const rel of listFiles(dir)) {
    h.update(rel).update("\0").update(fs.readFileSync(path.join(dir, rel))).update("\0");
  }
  return h.digest("hex");
}

/** Cheap change detector for the whole content tree (paths, sizes, mtimes), without reading files. */
export function fingerprintTree(root: string): string {
  const h = crypto.createHash("sha1");
  const walk = (dir: string, rel: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "__pycache__") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, `${rel}/${e.name}`);
      else {
        const st = fs.statSync(full);
        h.update(`${rel}/${e.name}:${st.size}:${Math.floor(st.mtimeMs)}\n`);
      }
    }
  };
  walk(root, "");
  return h.digest("hex");
}

export function itemDirs(root: string, type: ContentType): string[] {
  const base = path.join(root, type);
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("_"))
    .map((e) => path.join(base, e.name))
    .sort();
}

export interface LoadResult {
  items: ContentItem[];
  errors: ContentError[];
}

/** Loads every item under `root`. A broken item is reported in `errors` and doesn't stop the rest. */
export function loadContentDir(root: string): LoadResult {
  const items: ContentItem[] = [];
  const errors: ContentError[] = [];
  for (const type of CONTENT_TYPES) {
    for (const dir of itemDirs(root, type)) {
      try {
        items.push(LOADERS[type](dir));
      } catch (e) {
        if (e instanceof ContentError) errors.push(e);
        else errors.push(new ContentError(`${type}/${path.basename(dir)}`, (e as Error).message));
      }
    }
  }
  return { items, errors };
}

export interface StoredItem {
  type: ContentType;
  slug: string;
  version: number;
  title: string;
  /** Behavioral questions have none. */
  difficulty: string | null;
  tags: string[];
  publicJson: string;
  privateJson: string;
  source: string;
  reviewed: boolean;
  contentHash: string;
}

export function toStored(item: ContentItem): StoredItem {
  const base = {
    type: item.type,
    slug: item.slug,
    version: item.manifest.version,
    title: item.manifest.title,
    source: item.manifest.source,
    reviewed: item.manifest.reviewed,
    contentHash: hashItemDir(item.dir),
  };
  switch (item.type) {
    case "dsa":
      return { ...base, difficulty: item.manifest.difficulty, tags: item.manifest.tags, publicJson: JSON.stringify(toPublic(item)), privateJson: JSON.stringify(toPrivate(item)) };
    case "cs":
      return { ...base, difficulty: item.manifest.difficulty, tags: item.manifest.topics, publicJson: JSON.stringify(csPublic(item)), privateJson: JSON.stringify(csPrivate(item)) };
    case "behavioral":
      return { ...base, difficulty: null, tags: item.manifest.competencies, publicJson: JSON.stringify(behavioralPublic(item)), privateJson: JSON.stringify(behavioralPrivate(item)) };
  }
}
