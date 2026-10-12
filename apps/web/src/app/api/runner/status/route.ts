import { JudgeError, runnerStatus } from "@/server/judge/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await runnerStatus());
  } catch (e) {
    const error = e instanceof JudgeError ? e.message : "Unknown error";
    return Response.json({ ok: false, docker: false, version: "", languages: {}, error });
  }
}
