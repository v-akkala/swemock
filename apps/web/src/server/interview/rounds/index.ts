import "server-only";
import type { SessionRow } from "../../dsa/store";
import { behavioralRound } from "./behavioral";
import { dsaRound } from "./dsa";
import { recruiterRound } from "./recruiter";
import type { Round } from "./types";

export type { Round, RoundCtx } from "./types";

export function roundFor(session: Pick<SessionRow, "roundType">): Round {
  switch (session.roundType) {
    case "recruiter":
      return recruiterRound;
    case "behavioral":
      return behavioralRound;
    default:
      return dsaRound;
  }
}
