import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AiError, normalizeMessages, type ChatRequest, type LLMProvider, type StreamEvent } from "../types";

/**
 * Models that accept the server-side refusal fallback (`fallbacks: "default"`): if a safety classifier
 * declines, the API re-runs the request on a suitable model within the same call.
 */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new AiError("auth", "Anthropic rejected the API key. Check it in Settings.");
  }
  if (e instanceof Anthropic.NotFoundError) return new AiError("config", "Anthropic doesn't recognize that model ID. Check the model names in Settings.");
  if (e instanceof Anthropic.RateLimitError) return new AiError("rate_limit", "Anthropic is rate limiting requests. Try again in a moment.");
  if (e instanceof Anthropic.BadRequestError) return new AiError("bad_request", `Anthropic rejected the request: ${e.message}`);
  if (e instanceof Anthropic.APIConnectionError) return new AiError("unavailable", "Couldn't reach Anthropic. Check your internet connection.");
  if (e instanceof Anthropic.APIError) return new AiError("unavailable", `Anthropic returned an error (${e.status ?? "unknown"}).`);
  return new AiError("unavailable", e instanceof Error ? e.message : String(e));
}

export function anthropicProvider(apiKey: string): LLMProvider {
  // The SDK retries 408/409/429/5xx and connection errors with backoff.
  const client = new Anthropic({ apiKey, maxRetries: 3, timeout: 120_000 });

  return {
    id: "anthropic",

    async *stream(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
      // Current Claude models reject sampling parameters (temperature), so none are sent; determinism for
      // grading comes from the fixed prompt and rubric instead.
      const system: Anthropic.TextBlockParam[] = [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }];
      if (req.context) system.push({ type: "text", text: req.context });
      const params = {
        model: req.model,
        max_tokens: req.maxTokens,
        system,
        messages: normalizeMessages(req.messages),
        ...(req.effort ? { output_config: { effort: req.effort } } : {}),
      };
      try {
        const stream = FALLBACK_MODELS.has(req.model)
          ? client.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }, { signal })
          : client.messages.stream(params, { signal });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield { type: "text", text: event.delta.text };
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") throw new AiError("refusal", "The model declined to respond to this request.");
        const u = final.usage;
        yield {
          type: "done",
          usage: {
            inputTokens: u.input_tokens,
            outputTokens: u.output_tokens,
            cacheReadTokens: u.cache_read_input_tokens ?? 0,
            cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
          },
        };
      } catch (e) {
        throw toAiError(e);
      }
    },

    async testConnection(models) {
      try {
        for (const m of [...new Set(models.filter(Boolean))]) await client.models.retrieve(m);
        return { ok: true, detail: `Connected. Models available: ${[...new Set(models)].join(", ")}.` };
      } catch (e) {
        return { ok: false, detail: toAiError(e).message };
      }
    },
  };
}
