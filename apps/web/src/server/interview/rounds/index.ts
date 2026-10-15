import "server-only";
import type { SessionRow } from "../../dsa/store";
import { behavioralRound } from "./behavioral";
import { dsaRound } from "./dsa";
import { fluencyRound } from "./fluency";
import { lldRound } from "./lld";
import { recruiterRound } from "./recruiter";
import type { Round } from "./types";

export type { Round, RoundCtx } from "./types";

export function roundFor(session: Pick<SessionRow, "roundType">): Round {
  switch (session.roundType) {
    case "recruiter":
      return recruiterRound;
    case "behavioral":
      return behavioralRound;
    case "lld":
      return lldRound;
    case "comprehension":
    case "review":
    case "extension":
      return fluencyRound;
    default:
      return dsaRound;
  }
}
