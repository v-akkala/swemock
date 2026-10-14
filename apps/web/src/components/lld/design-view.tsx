"use client";

import { useState } from "react";
import { Markdown } from "@/components/markdown";
import type { LldRevealPayload } from "@/lib/lld-types";
import { cn } from "@/lib/utils";
import { MermaidDiagram } from "./mermaid-diagram";

export function DesignView({ reveal, languages }: { reveal: LldRevealPayload; languages: { id: string; label: string }[] }) {
  const langs = languages.filter((l) => reveal.references[l.id]);
  const [pick, setPick] = useState(langs[0]?.id);
  const files = pick ? reveal.references[pick] : undefined;
  return (
    <div className="space-y-5" data-testid="design-view">
      <Markdown>{reveal.designMd}</Markdown>
      <div>
        <h3 className="mb-1 font-medium">Class diagram</h3>
        <MermaidDiagram source={reveal.diagram} />
      </div>
      {files && (
        <div>
          <h3 className="mb-1 font-medium">Reference implementation</h3>
          <div className="mb-2 flex gap-1" role="tablist" aria-label="Reference language">
            {langs.map((l) => (
              <button key={l.id} role="tab" aria-selected={pick === l.id} onClick={() => setPick(l.id)} className={cn("rounded-md border border-border px-2 py-0.5 text-xs", pick === l.id && "bg-muted font-medium")}>
                {l.label}
              </button>
            ))}
          </div>
          {Object.entries(files).map(([path, text]) => (
            <div key={path} className="mb-3">
              <p className="text-muted-foreground mb-1 font-mono text-xs">{path}</p>
              <pre className="bg-muted overflow-auto rounded-md p-3 font-mono text-xs">{text}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
