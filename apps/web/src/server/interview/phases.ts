export interface Phase {
  id: string;
  label: string;
  minutes: number;
}

/** Spec §7.1: intro 2m → clarify 5m → approach 8m → code 25m → test and complexity 5m → questions 5m. */
export const DSA_PHASES: Phase[] = [
  { id: "intro", label: "Introductions", minutes: 2 },
  { id: "clarify", label: "Clarifying questions", minutes: 5 },
  { id: "approach", label: "Approach", minutes: 8 },
  { id: "code", label: "Coding", minutes: 25 },
  { id: "test", label: "Testing and complexity", minutes: 5 },
  { id: "questions", label: "Your questions", minutes: 5 },
];

export const totalMinutes = (phases: Phase[]) => phases.reduce((n, p) => n + p.minutes, 0);

export function phasePlanText(phases: Phase[]): string {
  let at = 0;
  return phases
    .map((p, i) => {
      const line = `${i + 1}. ${p.label}: ${p.minutes} min (minute ${at} to ${at + p.minutes})`;
      at += p.minutes;
      return line;
    })
    .join("\n");
}
