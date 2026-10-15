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
      if (said.includes("LEAK_TEST") && !/<reference_solution|<reference_implementation/.test(req.system)) {
        // Conversation rounds: quote the hidden key points / strong-answer signals.
        const hidden = req.system.split("\n").find((l) => /Key points: |Strong answer signals: /.test(l)) ?? "";
        return `Sure, here is exactly what a strong answer covers: ${hidden.replace(/^.*?(Key points|Strong answer signals): /, "")}`;
      }
      if (said.includes("LEAK_TEST")) {
        const ref = /<reference_(?:solution|implementation)[^>]*>([\s\S]*?)<\/reference_(?:solution|implementation)>/.exec(req.system)?.[1]?.trim() ?? "";
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
    case "assistant": {
      const asked = lastUser(req);
      if (asked.includes("NOCODE")) return "[fake assistant] Here is an explanation without any code: the function loops once and returns early.";
      const m = /### (\S+)[^\n]*\n```\n([\s\S]*?)\n```/.exec(req.context ?? "");
      if (!m) return "[fake assistant] I can't see any attached file; attach one and ask again.";
      const helper = "\n\ndef fake_assistant_helper(values, start=0):\n    total = start\n    for i in range(len(values)):\n        if values[i] < 10:\n            total += values[i]\n    return total\n";
      return `[fake assistant] I added a helper to ${m[1]}.\n\n\`\`\`python path=${m[1]}\n${m[2]!.replace(/\n$/, "")}${helper}\`\`\`\n`;
    }
    case "feedback": {
      const text = lastUser(req);
      // Candidate lines from the transcript: the fake only ever rewords what was actually said.
      const said = [...text.matchAll(/\] Candidate: (.+)/g)].map((m) => m[1]!);
      const longest = [...said].sort((a, b) => b.length - a.length)[0] ?? "I worked on it.";
      if (text.includes("Resume feedback after a mock recruiter screen")) {
        const bullet = /## Bullets the recruiter probed\n\n- ([^\n(]+)/.exec(text)?.[1]?.trim() ?? "A resume bullet";
        const feedback = {
          bullets: [
            {
              original: bullet,
              drew_followup: true,
              could_back_up: "partly",
              problem: "[fake] The claim was general and the recruiter pressed on how it was measured.",
              rewrite: bullet.replace(/^(\w)/, (c) => c.toUpperCase()),
              needs_from_candidate: ["[fake] How the result was measured"],
            },
          ],
          summary: "[fake] Lead with your own contribution and the measured result.",
        };
        return `Here is my feedback.\n\n\`\`\`json\n${JSON.stringify(feedback, null, 2)}\n\`\`\`\n`;
      }
      const rewrite = {
        answers: [{ question: "[fake] The first question", stronger_version: `[fake] ${longest}`, missing_facts: ["[fake] The measurable result"] }],
      };
      return `Here are the stronger versions.\n\n\`\`\`json\n${JSON.stringify(rewrite, null, 2)}\n\`\`\`\n`;
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
