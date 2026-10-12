"use client";

import dynamic from "next/dynamic";

/** Monaco is large and browser-only: load it on demand, never during server rendering. */
export const CodeEditor = dynamic(() => import("./code-editor"), {
  ssr: false,
  loading: () => <p className="text-muted-foreground p-3 text-sm">Loading editor…</p>,
});
