import { afterEach, describe, expect, it, vi } from "vitest";
import { openAiCompatibleProvider } from "./openai-compatible";
import { AiError } from "../types";

function sse(chunks: object[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const req = { model: "m", role: "interviewer" as const, purpose: "interviewer" as const, system: "S", context: "C", messages: [{ role: "assistant" as const, content: "Hi" }], maxTokens: 50, temperature: 0 };

afterEach(() => vi.unstubAllGlobals());

describe("OpenAI-compatible provider", () => {
  it("streams text and reports usage, sending system + context and a user-first conversation", async () => {
    const fetchMock = vi.fn(async () =>
      sse([{ choices: [{ delta: { content: "Hel" } }] }, { choices: [{ delta: { content: "lo" } }] }, { choices: [], usage: { prompt_tokens: 10, completion_tokens: 2 } }]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = openAiCompatibleProvider({ id: "ollama", baseUrl: "http://x/v1/", apiKey: null });
    const events = [];
    for await (const e of p.stream(req)) events.push(e);
    expect(events).toEqual([
      { type: "text", text: "Hel" },
      { type: "text", text: "lo" },
      { type: "done", usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 } },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://x/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.messages[0]).toEqual({ role: "system", content: "S\n\nC" });
    expect(body.messages[1].role).toBe("user");
    expect(body.temperature).toBe(0);
  });

  it("retries 5xx responses and maps auth failures", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++calls < 3 ? new Response("busy", { status: 503 }) : sse([{ choices: [{ delta: { content: "ok" } }] }]))));
    const p = openAiCompatibleProvider({ id: "openai-compatible", baseUrl: "http://x/v1", apiKey: "k" });
    let text = "";
    for await (const e of p.stream(req)) if (e.type === "text") text += e.text;
    expect(text).toBe("ok");
    expect(calls).toBe(3);
    vi.useRealTimers();

    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    await expect(async () => {
      for await (const _ of p.stream(req)) void _;
    }).rejects.toMatchObject({ kind: "auth" } satisfies Partial<AiError>);
  });

  it("tells the user which Ollama models still need pulling", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{ id: "qwen3.5:4b" }] })));
    const p = openAiCompatibleProvider({ id: "ollama", baseUrl: "http://x/v1", apiKey: null });
    const r = await p.testConnection(["qwen3.5:9b", "qwen3.5:4b"]);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("ollama pull qwen3.5:9b");
  });
});
