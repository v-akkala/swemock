import { z } from "zod";
import { handle, readJson } from "@/server/http/errors";
import { listResumes, saveResume } from "@/server/resume/store";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(() => Response.json({ resumes: listResumes() }));
}

const body = z.object({
  title: z.string().max(80).default(""),
  text: z.string().max(40_000),
  source: z.enum(["paste", "pdf"]).default("paste"),
});

/** Saves a new resume version. Versions are never edited in place. */
export function POST(request: Request) {
  return handle(async () => Response.json(saveResume(await readJson(request, body))));
}
