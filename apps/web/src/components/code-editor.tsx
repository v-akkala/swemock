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
  /** Identifies what is open (tests wait for it after switching files). */
  label?: string;
  /** Highlighted line ranges (gutter annotations), with a hover note. */
  marks?: { from: number; to: number; note: string }[];
  /** Reports the selected lines (1-based, inclusive), or the cursor line; null when nothing is focused. */
  onSelection?: (sel: { from: number; to: number; text: string } | null) => void;
  /** A line to scroll to and select (clicking a finding in a list). */
  reveal?: { line: number; nonce: number } | null;
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

export default function CodeEditor({ language, value, onChange, onRun, onSubmit, readOnly, height = "100%", label, marks, onSelection, reveal }: CodeEditorProps) {
  const dark = useDarkMode();
  // Monaco commands are registered once; keep them pointing at the latest callbacks.
  const handlers = useRef({ onRun, onSubmit });
  useEffect(() => {
    handlers.current = { onRun, onSubmit };
  });

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const selectionHandler = useRef(onSelection);
  useEffect(() => {
    selectionHandler.current = onSelection;
  });

  useEffect(() => {
    decorations.current?.set(
      (marks ?? []).map((m) => ({
        range: new monaco.Range(m.from, 1, m.to, 1),
        options: { isWholeLine: true, className: "swemock-mark", glyphMarginClassName: "swemock-mark-glyph", glyphMarginHoverMessage: { value: m.note } },
      })),
    );
  }, [marks]);

  useEffect(() => {
    const ed = editorRef.current;
    if (ed && reveal) {
      ed.revealLineInCenter(reveal.line);
      ed.setSelection(new monaco.Selection(reveal.line, 1, reveal.line, 1));
    }
  }, [reveal]);

  return (
    <Editor
      height={height}
      language={language}
      value={value}
      theme={dark ? "vs-dark" : "vs"}
      onChange={(v) => onChange(v ?? "")}
      onMount={(editor) => {
        editorRef.current = editor;
        decorations.current = editor.createDecorationsCollection([]);
        decorations.current.set(
          (marks ?? []).map((m) => ({
            range: new monaco.Range(m.from, 1, m.to, 1),
            options: { isWholeLine: true, className: "swemock-mark", glyphMarginClassName: "swemock-mark-glyph", glyphMarginHoverMessage: { value: m.note } },
          })),
        );
        editor.onDidChangeCursorSelection((e) => {
          const s = e.selection;
          const model = editor.getModel();
          selectionHandler.current?.({ from: s.startLineNumber, to: s.endLineNumber, text: model && !s.isEmpty() ? model.getValueInRange(s) : "" });
        });
        // Cmd/Ctrl+Enter runs; Cmd/Ctrl+Shift+Enter submits (spec §12).
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => handlers.current.onRun?.());
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => handlers.current.onSubmit?.());
        // Hook for end-to-end tests, which can't type whole programs reliably through auto-indent.
        // With several editors mounted (an assessment has two), it targets the one on screen.
        (window as unknown as { __swemockEditorLabel?: string }).__swemockEditorLabel = label;
        (window as unknown as { __swemockSetCode?: (v: string) => void }).__swemockSetCode = (value) => {
          const visible = monaco.editor.getEditors().find((e) => e.getDomNode()?.offsetParent != null);
          visible?.setValue(value);
        };
      }}
      options={{
        readOnly,
        glyphMargin: Boolean(marks),
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
