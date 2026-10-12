import "server-only";
import { AiError, normalizeMessages, type ChatRequest, type LLMProvider, type StreamEvent } from "../types";

const RETRIES = 3;

async function sleep(ms: number, signal?: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new AiError("unavailable", "Cancelled."));
    });
  });
}

/**
 * Any endpoint implementing OpenAI's chat-completions API: Ollama (`<host>:11434/v1`), vLLM, LM Studio,
 * OpenRouter, OpenAI itself. Plain fetch; no SDK for a single endpoint.
 */
export function openAiCompatibleProvider(opts: { id: "ollama" | "openai-compatible"; baseUrl: string; apiKey: string | null }): LLMProvider {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const label = opts.id === "ollama" ? "Ollama" : "the OpenAI-compatible endpoint";
  const headers = (): Record<string, string> => ({
    "content-type": "application/json",
    ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
  });

  async function post(body: unknown, signal?: AbortSignal): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${base}/chat/completions`, { method: "POST", headers: headers(), body: JSON.stringify(body), signal });
      } catch (e) {
        if ((e as Error).name === "AbortError") throw new AiError("unavailable", "Cancelled.");
        if (attempt < RETRIES) {
          await sleep(1000 * 2 ** attempt, signal);
          continue;
        }
        throw new AiError(
          "unavailable",
          opts.id === "ollama" ? `Couldn't reach Ollama at ${base}. Is it running?` : `Couldn't reach ${base}.`,
        );
      }
      if (res.ok) return res;
      const text = await res.text().catch(() => "");
      if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) {
        await sleep(1000 * 2 ** attempt, signal);
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new AiError("auth", `${label} rejected the API key.`);
      if (res.status === 404) throw new AiError("config", `${label} doesn't know that model (${text.slice(0, 200)}). Check the model names in Settings.`);
      if (res.status === 429) throw new AiError("rate_limit", `${label} is rate limiting requests.`);
      throw new AiError(res.status >= 500 ? "unavailable" : "bad_request", `${label} returned ${res.status}: ${text.slice(0, 300)}`);
    }
  }

  return {
    id: opts.id,

    async *stream(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
      const system = req.context ? `${req.system}\n\n${req.context}` : req.system;
      const res = await post(
        {
          model: req.model,
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: req.maxTokens,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          messages: [{ role: "system", content: system }, ...normalizeMessages(req.messages)],
        },
        signal,
      );
      const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          let chunk: {
            choices?: { delta?: { content?: string | null } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | null;
          };
          try {
            chunk = JSON.parse(data);
          } catch {
            continue;
          }
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) yield { type: "text", text };
          if (chunk.usage) {
            usage.inputTokens = chunk.usage.prompt_tokens ?? 0;
            usage.outputTokens = chunk.usage.completion_tokens ?? 0;
            usage.cacheReadTokens = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
          }
        }
      }
      yield { type: "done", usage };
    },

    async testConnection(models) {
      try {
        const res = await fetch(`${base}/models`, { headers: headers(), signal: AbortSignal.timeout(8000) });
        if (res.status === 401 || res.status === 403) return { ok: false, detail: `${label} rejected the API key.` };
        if (!res.ok) return { ok: false, detail: `${label} returned ${res.status} for /models.` };
        const ids = new Set(((await res.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? []);
        const wanted = [...new Set(models.filter(Boolean))];
        if (wanted.length === 0) return { ok: false, detail: "Name a model for each role." };
        // Some gateways list a subset of what they serve; only Ollama's list is authoritative.
        const missing = opts.id === "ollama" ? wanted.filter((m) => !ids.has(m) && !ids.has(`${m}:latest`)) : [];
        if (missing.length) {
          return { ok: false, detail: `Connected, but these models aren't pulled yet: ${missing.join(", ")}. Run: ${missing.map((m) => `ollama pull ${m}`).join(" && ")}` };
        }
        return { ok: true, detail: `Connected to ${base}. Models: ${wanted.join(", ")}.` };
      } catch {
        return {
          ok: false,
          detail: opts.id === "ollama" ? `Couldn't reach Ollama at ${base}. Start the Ollama app (or \`ollama serve\`) and try again.` : `Couldn't reach ${base}.`,
        };
      }
    },
  };
}
