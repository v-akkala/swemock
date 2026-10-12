import { languageSchema, LIMITS } from "@swemock/shared";
import { z } from "zod";
import { judgeErrorResponse, parseBody } from "@/server/http/json";
import { runDsa } from "@/server/judge/client";
import { SAMPLE_PROBLEM } from "@/server/judge/sample";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ language: languageSchema, code: z.string().max(LIMITS.maxCodeBytes) });

export async function POST(request: Request) {
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;
  try {
    return Response.json(
      await runDsa({ ...body.data, signature: SAMPLE_PROBLEM.signature, tests: SAMPLE_PROBLEM.tests }),
    );
  } catch (e) {
    return judgeErrorResponse(e);
  }
}
