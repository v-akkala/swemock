import "server-only";
import type { z } from "zod";
import { type ModelRole } from "@swemock/shared";
import { extractJsonBlock } from "@swemock/shared/scoring";
import { getProvider, resolveAi } from "./config";
import { assertUnderCap, recordUsage } from "./usage";
import { AiError, type ChatRequest } from "./types";

export interface CallOptions extends Omit<ChatRequest, "model" | "role"> {
  role: ModelRole;
  sessionId: string | null;
  signal?: AbortSignal;
}

/** Streams text from the configured model for a role, recording token usage when it finishes. */
export async function* streamText(opts: CallOptions): AsyncGenerator<string> {
  const resolved = resolveAi();
  const provider = getProvider(resolved);
  assertUnderCap(opts.sessionId, resolved.provider);
  const model = resolved.models[opts.role];
  const { sessionId, signal, ...req } = opts;
  for await (const event of provider.stream({ ...req, model }, signal)) {
    if (event.type === "text") yield event.text;
    else recordUsage({ sessionId, role: opts.role, provider: resolved.provider, model, usage: event.usage });
  }
}

export async function completeText(opts: CallOptions): Promise<string> {
  let out = "";
  for await (const chunk of streamText(opts)) out += chunk;
  return out;
}

/**
 * Asks for a reply ending in a ```json block, then validates it. On a bad block, asks once more with the
 * validation error (models usually fix it on the second try).
 */
export async function completeJson<S extends z.ZodType>(
  opts: CallOptions,
  schema: S,
  extraCheck?: (value: z.output<S>) => string | null,
): Promise<{ value: z.output<S>; raw: string }> {
  let messages = opts.messages;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await completeText({ ...opts, messages });
    const block = extractJsonBlock(raw);
    let problem: string;
    if (!block.ok) problem = block.error;
    else {
      const parsed = schema.safeParse(block.value);
      if (parsed.success) {
        const extra = extraCheck?.(parsed.data);
        if (!extra) return { value: parsed.data, raw };
        problem = extra;
      } else {
        problem = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      }
    }
    messages = [
      ...messages,
      { role: "assistant", content: raw },
      { role: "user", content: `Your JSON block didn't validate: ${problem}. Reply again, ending with one corrected \`\`\`json block.` },
    ];
  }
  throw new AiError("bad_request", "The model's reply didn't match the expected format twice in a row.");
}
