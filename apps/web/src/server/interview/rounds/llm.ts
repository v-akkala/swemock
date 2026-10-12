import "server-only";
import { getBehavioralPrivate, getBehavioralPublic, getCsPrivate, getCsPublic } from "../../content/questions";
import type { SessionRow } from "../../dsa/store";
import { loadTemplate, render } from "../../prompts/templates";
import { phasePlanText, totalMinutes } from "../phases";
import type { BehavioralRound, InterviewState, RecruiterRound } from "../state";

/** What the AI driver needs from a round: its system prompt, the per-turn note, and what must never leak. */
export interface LlmRound {
  system(session: SessionRow, state: InterviewState): { text: string; versionTag: string };
  context(session: SessionRow, state: InterviewState, now: number): { text: string; code: string | null };
  leak(session: SessionRow, state: InterviewState): { code: string[]; prose: string[] };
  /** Code blocks in a reply are blocked outright (coding rounds, where they'd be solutions). */
  blockCodeBlocks: boolean;
}

/** Elapsed time and phase, shared by every round's per-turn note. */
export function timeLines(session: SessionRow, state: InterviewState, now: number): string[] {
  const phase = state.phases[state.phaseIndex]!;
  const elapsed = Math.floor((now - session.startedAt) / 60_000);
  const phaseLeft = Math.max(0, Math.ceil((state.phaseStartedAt + phase.minutes * 60_000 - now) / 60_000));
  const totalLeft = Math.max(0, Math.ceil((state.deadline - now) / 60_000));
  return ["<context>", `Elapsed: ${elapsed} min. Current phase: ${phase.label} (${phaseLeft} min left in this phase, ${totalLeft} min left overall).`];
}

function simpleContext(session: SessionRow, state: InterviewState, now: number) {
  return { text: [...timeLines(session, state, now), "</context>"].join("\n"), code: null };
}

// ---- recruiter ----------------------------------------------------------------------------------------

function poolText(round: RecruiterRound): string {
  return round.pool
    .map((p) => {
      const pub = getCsPublic(p.id);
      const priv = getCsPrivate(p.id);
      if (!pub || !priv) return null;
      return `- [${p.difficulty}] ${pub.prompt.trim().replace(/\s+/g, " ")}\n  Key points: ${priv.keyPoints.join("; ")}`;
    })
    .filter(Boolean)
    .join("\n");
}

export const recruiterLlm: LlmRound = {
  blockCodeBlocks: false,
  system(_session, state) {
    const r = state.round as RecruiterRound;
    const t = loadTemplate("interviewer/recruiter-system.md");
    const text = render(t.body, {
      minutes: String(totalMinutes(state.phases)),
      persona_suffix: "",
      role: r.config.role || "software engineering",
      company_clause: r.config.company ? ` at ${r.config.company}` : "",
      resume_title: r.config.resumeTitle,
      resume: r.config.resumeText,
      job_description: r.config.jobDescription || "(none provided)",
      probes: r.probeBullets.length ? r.probeBullets.map((b) => `- ${b.text} [${b.flags.join(", ") || "no flags"}]`).join("\n") : "(none found)",
      pool: poolText(r),
      phase_plan: phasePlanText(state.phases),
    });
    return { text, versionTag: t.versionTag };
  },
  context: simpleContext,
  leak(_session, state) {
    const r = state.round as RecruiterRound;
    const prose = r.pool.flatMap((p) => {
      const priv = getCsPrivate(p.id);
      return priv ? [priv.modelAnswer, ...priv.keyPoints] : [];
    });
    return { code: [], prose };
  },
};

// ---- behavioral ---------------------------------------------------------------------------------------

const LENS_NAMES: Record<string, string> = {
  amazon: "Amazon-style leadership principles (customer obsession, ownership, bias for action, dive deep, deliver results…)",
  google: "Google-style (comfort with ambiguity, collaboration, valuing feedback, user focus, humility)",
  meta: "Meta-style (move fast, be bold, focus on impact, be open)",
};

export const behavioralLlm: LlmRound = {
  blockCodeBlocks: false,
  system(_session, state) {
    const r = state.round as BehavioralRound;
    const t = loadTemplate("interviewer/behavioral-system.md");
    const questions = r.config.questionIds
      .map((slug, i) => {
        const pub = getBehavioralPublic(slug);
        const priv = getBehavioralPrivate(slug);
        if (!pub || !priv) return null;
        return [
          `${i + 1}. ${pub.prompt.trim().replace(/\s+/g, " ")}`,
          `   Competencies: ${pub.competencies.join(", ")}`,
          `   Authored follow-ups: ${priv.followUps.join(" | ")}`,
          `   Strong answer signals: ${priv.strongSignals.join("; ")}`,
          priv.redFlags.length ? `   Red flags: ${priv.redFlags.join("; ")}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .filter(Boolean)
      .join("\n\n");
    const text = render(t.body, {
      minutes: String(totalMinutes(state.phases)),
      count: String(r.config.questionIds.length),
      persona_suffix: "",
      lens: r.config.lens ? (LENS_NAMES[r.config.lens] ?? r.config.lens) : "none",
      questions,
      phase_plan: phasePlanText(state.phases),
    });
    return { text, versionTag: t.versionTag };
  },
  context: simpleContext,
  leak(_session, state) {
    const r = state.round as BehavioralRound;
    const prose = r.config.questionIds.flatMap((slug) => {
      const priv = getBehavioralPrivate(slug);
      return priv ? [...priv.strongSignals, ...priv.redFlags] : [];
    });
    return { code: [], prose };
  },
};
