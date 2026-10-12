import type { ModelRole, Provider } from "@swemock/shared";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** What the code using a model asks for; providers translate it to their API. */
export interface ChatRequest {
  model: string;
  role: ModelRole;
  /** Why the call is made. Real providers ignore it; the fake provider uses it to pick a scripted reply. */
  purpose: "interviewer" | "grader" | "approach" | "test";
  /** Large and stable (round template, problem context): cached where the provider supports it. */
  system: string;
  /** Small and per-turn (elapsed time, phase, latest code): sent after the cached prefix. */
  context?: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** Used by providers that accept sampling parameters (Ollama, OpenAI-compatible). */
  temperature?: number;
  /** Reasoning effort, for providers that support it (Anthropic). */
  effort?: "low" | "medium" | "high";
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type StreamEvent = { type: "text"; text: string } | { type: "done"; usage: Usage };

export interface ConnectionCheck {
  ok: boolean;
  detail: string;
}

export interface LLMProvider {
  id: Provider;
  stream(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamEvent>;
  /** Cheap check that credentials work and the configured models exist (no generation). */
  testConnection(models: string[]): Promise<ConnectionCheck>;
}

export type AiErrorKind = "config" | "auth" | "rate_limit" | "unavailable" | "bad_request" | "refusal" | "cap";

/** A model call failed. `message` is written for the user. */
export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
  ) {
    super(message);
  }
  get retryable(): boolean {
    return this.kind === "rate_limit" || this.kind === "unavailable";
  }
}

/** Some APIs need the conversation to start with the user and to alternate roles. */
export function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (!m.content.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else out.push({ ...m });
  }
  if (out[0]?.role !== "user") out.unshift({ role: "user", content: "(The session begins.)" });
  return out;
}
