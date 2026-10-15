"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export type PacketKind =
  | "dsa-interview-live"
  | "dsa-grading"
  | "approach-check"
  | "recruiter-live"
  | "recruiter-grading"
  | "resume-feedback"
  | "behavioral-live"
  | "behavioral-grading"
  | "behavioral-rewrite"
  | "lld-interview-live"
  | "lld-grading"
  | "fluency-live"
  | "fluency-grading";
type Kind = PacketKind;

interface Packet {
  markdown: string;
  filename: string;
  versionTag: string;
  sessionId: string;
}

/**
 * Copy-prompt fallback (spec §2.4): copy or download a self-contained prompt for any chatbot, then paste
 * the reply back. Every copy, download, and paste is logged with the session.
 */
export function PacketPanel(props: {
  kind: Kind;
  sessionId?: string;
  slug?: string;
  itemType?: "dsa" | "lld";
  /** For approach checks: read the current approach text when the packet is built. */
  getApproach?: () => string;
  title: string;
  description: string;
  pasteLabel?: string;
  /** Grading replies must end with a ```json block; others are stored as text. */
  expectsJson?: boolean;
  allowPaste?: boolean;
  onPasted?: (result: unknown, packet: { sessionId: string }) => void;
}) {
  const [packet, setPacket] = useState<Packet | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  async function build(): Promise<Packet | null> {
    setError(null);
    try {
      const p = await api<Packet>("/api/packets", "POST", {
        kind: props.kind,
        sessionId: props.sessionId,
        slug: props.slug,
        itemType: props.itemType,
        approach: props.getApproach?.(),
      });
      setPacket(p);
      return p;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  async function log(p: Packet, action: "copy" | "download") {
    await api("/api/packets/log", "POST", { sessionId: p.sessionId, kind: props.kind, action, version: p.versionTag }).catch(() => undefined);
  }

  async function copy() {
    const p = await build();
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p.markdown);
      setStatus("Copied. Paste it into claude.ai or any assistant.");
    } catch {
      setStatus("Your browser blocked the clipboard: select the text below and copy it.");
    }
    await log(p, "copy");
  }

  async function download() {
    const p = await build();
    if (!p) return;
    const url = URL.createObjectURL(new Blob([p.markdown], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = p.filename;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded ${p.filename}.`);
    await log(p, "download");
  }

  async function paste() {
    setBusy(true);
    setError(null);
    try {
      const sessionId = packet?.sessionId ?? props.sessionId ?? (await build())?.sessionId;
      if (!sessionId) return;
      const res = await api<{ ok: boolean; error?: string }>("/api/packets/reply", "POST", { sessionId, kind: props.kind, text: reply });
      if (!res.ok) setError(`${res.error} Your text is kept below: fix the JSON block and save again.`);
      else {
        setStatus("Reply saved.");
        props.onPasted?.(res, { sessionId });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3 text-sm" data-testid={`packet-${props.kind}`}>
      <div>
        <p className="font-medium">{props.title}</p>
        <p className="text-muted-foreground text-xs">{props.description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={copy} data-testid="copy-packet">
          Copy prompt
        </Button>
        <Button variant="ghost" onClick={download}>
          Download .md
        </Button>
      </div>
      {status && <p className="text-muted-foreground text-xs" aria-live="polite">{status}</p>}
      {packet && (
        <details>
          <summary className="text-muted-foreground cursor-pointer text-xs">Show the prompt</summary>
          <textarea readOnly value={packet.markdown} className="bg-card mt-2 h-48 w-full rounded-md border border-border p-2 font-mono text-xs" />
        </details>
      )}
      {props.allowPaste !== false && (
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium">{props.pasteLabel ?? "Paste the reply"}</span>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              spellCheck={false}
              aria-label={props.pasteLabel ?? "Paste the reply"}
              className="bg-card h-28 w-full rounded-md border border-border p-2 font-mono text-xs"
              placeholder={props.expectsJson ? "Paste the whole reply; it must end with a ```json block." : "Paste the reply here."}
            />
          </label>
          <Button onClick={paste} disabled={busy || !reply.trim()} data-testid="save-reply">
            {busy ? "Saving…" : "Save reply"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400" data-testid="packet-error">
          {error}
        </p>
      )}
    </div>
  );
}
