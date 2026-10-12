import "server-only";
import type { Rubric } from "@swemock/shared/scoring";
import type { SessionRow } from "./dsa/store";

export const PACKET_KINDS = [
  "dsa-interview-live",
  "dsa-grading",
  "approach-check",
  "recruiter-live",
  "recruiter-grading",
  "resume-feedback",
  "behavioral-live",
  "behavioral-grading",
  "behavioral-rewrite",
] as const;
export type PacketKind = (typeof PACKET_KINDS)[number];

export interface Packet {
  kind: PacketKind;
  markdown: string;
  filename: string;
  versionTag: string;
  sessionId: string;
}

export function stamp(session: SessionRow, ts: number): string {
  const s = Math.max(0, Math.floor((ts - session.startedAt) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function rubricText(rubric: Rubric): string {
  return rubric.dimensions
    .map(
      (d) =>
        `### ${d.label} (id: \`${d.id}\`)\n${d.description}\n` +
        d.anchors.map((a, i) => `- **${i + 1}**: ${a}`).join("\n"),
    )
    .join("\n\n");
}
