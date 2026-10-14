"use client";

import { useEffect, useId, useState } from "react";

/**
 * Renders a Mermaid diagram in the browser (the library is bundled and loaded on first use; nothing comes
 * from a CDN). Falls back to the source text if it can't be drawn.
 */
export function MermaidDiagram({ source }: { source: string }) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = document.documentElement.classList.contains("dark");
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default" });
        const out = await mermaid.render(`m${id}`, source);
        if (!cancelled) setSvg(out.svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  if (failed) return <pre className="bg-muted overflow-auto rounded-md p-3 font-mono text-xs">{source}</pre>;
  if (!svg) return <p className="text-muted-foreground text-sm">Drawing the diagram…</p>;
  return <div className="overflow-auto rounded-md border border-border bg-white p-2 dark:bg-transparent" data-testid="mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}
