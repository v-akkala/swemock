import "server-only";
import { z } from "zod";
import type { FluencyType } from "@/lib/fluency-types";
import { ApiError } from "../http/errors";

export const typeParam = (t: string): FluencyType => {
  if (t !== "comprehension" && t !== "review" && t !== "extension") throw new ApiError(404, "Unknown exercise type.");
  return t;
};

export const filesSchema = z.record(z.string().max(200), z.string().max(200_000)).refine((f) => Object.keys(f).length <= 80, "too many files");
export const sessionSchema = z.string().max(40).optional();

export type Ctx = { params: Promise<{ type: string; slug: string }> };
