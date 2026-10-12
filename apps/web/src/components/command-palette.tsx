"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface PaletteItem {
  label: string;
  href: string;
  group: string;
}

/** Cmd/Ctrl+K: jump to any page or problem. */
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = open;
    if (open) setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  // Opening and closing always start from a clean slate.
  const show = useCallback((next: boolean) => {
    setQuery("");
    setActive(0);
    setOpen(next);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show(!openRef.current);
      } else if (e.key === "Escape") show(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show]);

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((i) => words.every((w) => i.label.toLowerCase().includes(w) || i.group.toLowerCase().includes(w))).slice(0, 12);
  }, [items, query]);

  function go(item: PaletteItem | undefined) {
    if (!item) return;
    show(false);
    router.push(item.href);
  }

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onMouseDown={(e) => e.target === e.currentTarget && show(false)}
    >
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="bg-background w-full max-w-lg rounded-lg border border-border shadow-xl">
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") go(matches[active]);
          }}
          placeholder="Go to a page or problem…"
          aria-label="Search pages and problems"
          className="w-full rounded-t-lg border-b border-border bg-transparent px-4 py-3 text-sm outline-none"
        />
        <ul className="max-h-80 overflow-auto py-1" role="listbox">
          {matches.map((m, i) => (
            <li key={m.href} role="option" aria-selected={i === active}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(m)}
                className={cn("flex w-full items-center justify-between px-4 py-2 text-left text-sm", i === active && "bg-muted")}
              >
                <span>{m.label}</span>
                <span className="text-muted-foreground text-xs">{m.group}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="text-muted-foreground px-4 py-3 text-sm">Nothing matches.</li>}
        </ul>
      </div>
    </div>
  );
}
