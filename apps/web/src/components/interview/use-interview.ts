"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export interface Phase {
  id: string;
  label: string;
  minutes: number;
}

export interface ChatMessage {
  id: string;
  ts: number;
  from: "interviewer" | "candidate" | "system";
  text: string;
  filtered: boolean;
  /** Set on lines that come from the content bank (question, follow-up, key-point reveal). */
  tag: string | null;
}

export interface InterviewState {
  status: string;
  serverNow: number;
  deadline: number;
  phases: Phase[];
  phaseIndex: number;
  phaseEndsAt: number;
  driver: "scripted" | "llm";
  liveVia: "app" | "packet";
  messages: ChatMessage[];
  usage: { total: number; cap: number };
  aiConnected: boolean;
  roundType: string;
  /** Recruiter screen: the question waiting for the candidate to grade themselves. */
  pendingGrade: string | null;
}

/** How an answer was given: reported with the message so the debrief can show speed and fillers. */
export interface AnswerMeta {
  voice?: boolean;
  speechMs?: number;
}

const POLL_MS = 3000;

export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Everything an interview page shares: the server-kept clock, polling, the chat (including streamed AI
 * replies), and the buttons that move or end the round. Pages differ only in what surrounds the chat.
 */
export function useInterview(sessionId: string, initialLiveVia: "app" | "packet") {
  const router = useRouter();
  const [state, setState] = useState<InterviewState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [streaming, setStreaming] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastTs = useRef(0);
  const ending = useRef(false);

  const poll = useCallback(async () => {
    try {
      const s = await api<InterviewState>(`/api/interview/${sessionId}/state?after=${lastTs.current}`, "GET");
      setOffset(s.serverNow - Date.now());
      setState(s);
      if (s.messages.length) {
        lastTs.current = s.messages[s.messages.length - 1]!.ts;
        setMessages((m) => [...m, ...s.messages.filter((x) => !m.some((y) => y.id === x.id))]);
      }
      if (s.status !== "active" && !ending.current) {
        ending.current = true;
        router.push(`/debrief/${sessionId}`);
      }
    } catch {
      /* transient; the next poll retries */
    }
  }, [router, sessionId]);

  useEffect(() => {
    void poll();
    const p = setInterval(() => void poll(), POLL_MS);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(p);
      clearInterval(t);
    };
  }, [poll]);

  async function send(meta?: AnswerMeta) {
    const text = input.trim();
    if (!text || streaming !== null) return;
    setInput("");
    setError(null);
    setAiError(null);
    // Show the message right away; the next poll replaces it with the stored one.
    setMessages((m) => [...m, { id: `local-${Date.now()}`, ts: Date.now(), from: "candidate", text, filtered: false, tag: null }]);
    const res = await fetch(`/api/interview/${sessionId}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, ...(meta && Object.keys(meta).length ? { meta } : {}) }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? `Couldn't send (${res.status}).`);
      return;
    }
    if (res.headers.get("content-type")?.includes("text/event-stream")) {
      setStreaming("");
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let shown = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const line = buffer.slice(0, idx).replace(/^data: /, "");
          buffer = buffer.slice(idx + 2);
          const ev = JSON.parse(line) as { type: string; text?: string; message?: string };
          if (ev.type === "delta") setStreaming((shown += ev.text ?? ""));
          if (ev.type === "replace") setStreaming((shown = ev.text ?? ""));
          if (ev.type === "error") setAiError(ev.message ?? "The AI interviewer failed.");
        }
      }
      setStreaming(null);
    }
    setMessages((m) => m.filter((x) => !x.id.startsWith("local-")));
    await poll();
  }

  async function switchDriver(to: "scripted" | "packet") {
    await api(`/api/interview/${sessionId}/driver`, "POST", { to });
    setAiError(null);
    if (to === "packet") router.refresh();
    await poll();
  }

  async function advance() {
    try {
      await api(`/api/interview/${sessionId}/advance`, "POST", {});
      await poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function end() {
    if (!window.confirm("End the interview now and go to the debrief?")) return;
    ending.current = true;
    await api(`/api/interview/${sessionId}/end`, "POST", {});
    router.push(`/debrief/${sessionId}`);
  }

  async function gradeQuestion(questionId: string, grade: 0 | 1 | 2) {
    try {
      await api(`/api/interview/${sessionId}/grade-question`, "POST", { questionId, grade });
      await poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const serverNow = now + offset;
  return {
    state,
    messages,
    streaming,
    input,
    setInput,
    aiError,
    error,
    send,
    switchDriver,
    advance,
    end,
    gradeQuestion,
    serverNow,
    liveVia: state?.liveVia ?? initialLiveVia,
    phaseLeft: state ? state.phaseEndsAt - serverNow : 0,
    totalLeft: state ? state.deadline - serverNow : 0,
  };
}

export type InterviewApi = ReturnType<typeof useInterview>;
