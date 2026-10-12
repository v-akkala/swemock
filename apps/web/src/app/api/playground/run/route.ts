import { languageSchema, LIMITS, type Language } from "@swemock/shared";
import { z } from "zod";
import { judgeErrorResponse, parseBody } from "@/server/http/json";
import { runProject } from "@/server/judge/client";

export const dynamic = "force-dynamic";

const FILE_NAMES: Record<Language, string> = { python: "main.py", cpp: "main.cpp" };

const bodySchema = z.object({
  language: languageSchema,
  code: z.string().max(LIMITS.maxCodeBytes),
  stdin: z.string().max(LIMITS.outputCapBytes).default(""),
});

export async function POST(request: Request) {
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;
  const { language, code, stdin } = body.data;
  const path = FILE_NAMES[language];
  try {
    return Response.json(
      await runProject({ language, files: { [path]: code }, command: { kind: "runFile", path }, stdin, timeoutMs: 10_000 }),
    );
  } catch (e) {
    return judgeErrorResponse(e);
  }
}
