import { LIMITS, languageSchema } from "@swemock/shared";
import { z } from "zod";

const sessionId = z.string().min(1).max(40).optional();

export const codeBodySchema = z.object({
  language: languageSchema,
  code: z.string().max(LIMITS.maxCodeBytes),
  sessionId,
  customInput: z.string().max(100_000).optional(),
});

export const draftBodySchema = z.object({
  language: languageSchema,
  code: z.string().max(LIMITS.maxCodeBytes),
  sessionId,
});

export const hintBodySchema = z.object({ level: z.number().int().min(1).max(4), sessionId });
export const sessionBodySchema = z.object({ sessionId });
