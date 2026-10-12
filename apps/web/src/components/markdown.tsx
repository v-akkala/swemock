"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { cn } from "@/lib/utils";

/** Markdown with LaTeX math ($…$ and $$…$$), rendered by KaTeX bundled locally (no CDN). */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-lite", className)}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
