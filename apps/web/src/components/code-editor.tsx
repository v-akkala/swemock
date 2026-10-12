"use client";

import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/features/register.all";
import "monaco-editor/languages/definitions/python/register";
import "monaco-editor/languages/definitions/cpp/register";
import { useEffect, useRef, useState } from "react";

// Monaco is bundled with the app and never loaded from a CDN (the app must work offline).
loader.config({ monaco });
if (typeof self !== "undefined") {
  (self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
    getWorker: () => new Worker(new URL("monaco-editor/editor/editor.worker.js", import.meta.url), { type: "module" }),
  };
}

export interface CodeEditorProps {
  /** Monaco language id: "python" or "cpp". */
  language: string;
  value: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  onSubmit?: () => void;
  readOnly?: boolean;
  height?: string;
}

function useDarkMode(): boolean {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export default function CodeEditor({ language, value, onChange, onRun, onSubmit, readOnly, height = "100%" }: CodeEditorProps) {
  const dark = useDarkMode();
  // Monaco commands are registered once; keep them pointing at the latest callbacks.
  const handlers = useRef({ onRun, onSubmit });
  useEffect(() => {
    handlers.current = { onRun, onSubmit };
  });

  return (
    <Editor
      height={height}
      language={language}
      value={value}
      theme={dark ? "vs-dark" : "vs"}
      onChange={(v) => onChange(v ?? "")}
      onMount={(editor) => {
        // Cmd/Ctrl+Enter runs; Cmd/Ctrl+Shift+Enter submits (spec §12).
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => handlers.current.onRun?.());
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => handlers.current.onSubmit?.());
        // Hook for end-to-end tests, which can't type whole programs reliably through auto-indent.
        // With several editors mounted (an assessment has two), it targets the one on screen.
        (window as unknown as { __swemockSetCode?: (v: string) => void }).__swemockSetCode = (value) => {
          const visible = monaco.editor.getEditors().find((e) => e.getDomNode()?.offsetParent != null);
          visible?.setValue(value);
        };
      }}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 14,
        tabSize: 4,
        insertSpaces: true,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderLineHighlight: "line",
        padding: { top: 8 },
        accessibilitySupport: "auto",
      }}
      loading={<p className="text-muted-foreground p-3 text-sm">Loading editor…</p>}
    />
  );
}
