import "server-only";
import type { ChatRequest, LLMProvider, StreamEvent } from "../types";

/**
 * Deterministic provider for tests and CI (spec §2.6): never calls a network. Replies depend only on the
 * request, so tests can assert on them. Enabled only with SWEMOCK_TEST_MODE=1.
 *
 * Triggers useful in tests: a candidate message containing LEAK_TEST makes the fake interviewer quote the
 * reference solution from its hidden context (to exercise the leak filter); NUDGE_TEST makes it nudge.
 */
function lastUser(req: ChatRequest): string {
  return [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
}

function reply(req: ChatRequest): string {
  const said = lastUser(req);
  switch (req.purpose) {
    case "interviewer": {
      if (said.includes("LEAK_TEST")) {
        const ref = /<reference_solution[^>]*>([\s\S]*?)<\/reference_solution>/.exec(req.system)?.[1]?.trim() ?? "";
        return `Sure, here is the full solution:\n\n\`\`\`python\n${ref}\n\`\`\``;
      }
      if (said.includes("NUDGE_TEST")) return "<<nudge>> Think about which values you have already seen, and how fast you can look them up.";
      const phase = /Current phase: ([^\n(]+)/.exec(req.context ?? "")?.[1]?.trim() ?? "the interview";
      if (!said || said === "(The session begins.)") return `[fake interviewer] Hi, I'm your interviewer today. We're starting with ${phase}. Take a minute to read the problem.`;
      return `[fake interviewer] Thanks. We're in ${phase}. What edge cases would you test, and what's the time complexity?`;
    }
    case "approach": {
      const a = (said.split("## The candidate's approach")[1] ?? said).toLowerCase();
      if (/hash|map|dict|set|stack|two pointer|sliding|binary search|heap|dynamic|dp/.test(a)) return "Works.\nThe idea is sound and runs in the expected time for these constraints.";
      if (/sort/.test(a)) return "Works but suboptimal (O(n log n)).\nSorting is correct, but a linear approach exists.";
      return "Doesn't work.\nThe approach as described doesn't handle the general case; think about what you need to remember while scanning.";
    }
    case "grader": {
      const ids = /Dimension ids: ([^\n]+)/.exec(req.system + "\n" + lastUser(req))?.[1]?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
      const grade = {
        dimensions: ids.map((id, i) => ({ id, score: (i % 2) + 2, evidence: [`[fake grader] evidence for ${id}`] })),
        recommendation: "lean_hire",
        strengths: ["[fake] clear structure", "[fake] tested edge cases", "[fake] good naming"],
        improvements: ["[fake] state complexity earlier", "[fake] ask about constraints", "[fake] narrate more"],
        strong_candidate: "[fake] A strong candidate would clarify constraints first and state complexity before coding.",
      };
      return `Here is my assessment.\n\n\`\`\`json\n${JSON.stringify(grade, null, 2)}\n\`\`\`\n`;
    }
    default:
      return "OK";
  }
}

export function fakeProvider(): LLMProvider {
  return {
    id: "fake",
    async *stream(req: ChatRequest): AsyncGenerator<StreamEvent> {
      const text = reply(req);
      for (let i = 0; i < text.length; i += 12) yield { type: "text", text: text.slice(i, i + 12) };
      const input = Math.ceil((req.system.length + (req.context?.length ?? 0) + req.messages.reduce((n, m) => n + m.content.length, 0)) / 4);
      yield { type: "done", usage: { inputTokens: input, outputTokens: Math.ceil(text.length / 4), cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
    async testConnection() {
      return { ok: true, detail: "Fake provider (testing only): always connected." };
    },
  };
}
