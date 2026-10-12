"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

/** The slice of the Web Speech API the app uses (not in TypeScript's DOM lib everywhere). */
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Optional voice input (spec §3, behind the `voiceInput` flag). The browser does the recognition, and in
 * Chrome and Edge that means the audio goes to the browser vendor's speech service; the app itself never
 * receives audio. Text input always works. Reports how long speech actually ran, for words per minute.
 */
export function useSpeech(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const startedAt = useRef(0);
  const spoken = useRef(0);
  const base = useRef("");
  // Server render and first client render agree (false); the real answer arrives right after hydration.
  const supported = useSyncExternalStore(
    () => () => undefined,
    () => ctor() !== null,
    () => false,
  );

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  const start = useCallback(
    (existing: string) => {
      const C = ctor();
      if (!C || rec.current) return;
      setError(null);
      const r = new C();
      r.continuous = true;
      r.interimResults = true;
      r.lang = navigator.language || "en-US";
      base.current = existing.trim() ? `${existing.trim()} ` : "";
      r.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i]![0].transcript;
        onText(base.current + text.trim());
      };
      r.onerror = (e) => {
        if (e.error !== "aborted" && e.error !== "no-speech") setError(e.error === "not-allowed" ? "The browser blocked the microphone." : `Speech recognition stopped: ${e.error}.`);
      };
      r.onend = () => {
        spoken.current += Date.now() - startedAt.current;
        rec.current = null;
        setListening(false);
      };
      rec.current = r;
      startedAt.current = Date.now();
      r.start();
      setListening(true);
    },
    [onText],
  );

  /** Milliseconds of speech since the last call (the answer being sent), including a recording still running. */
  const takeSpeechMs = useCallback(() => {
    const total = spoken.current + (rec.current ? Date.now() - startedAt.current : 0);
    spoken.current = 0;
    if (rec.current) startedAt.current = Date.now();
    return total;
  }, []);

  return { supported, listening, error, start, stop, takeSpeechMs };
}
