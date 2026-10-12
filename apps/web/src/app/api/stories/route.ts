import { handle, readJson } from "@/server/http/errors";
import { saveStory, storyCoverage, storyInputSchema } from "@/server/stories";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(() => Response.json(storyCoverage()));
}

export function POST(request: Request) {
  return handle(async () => Response.json(saveStory(await readJson(request, storyInputSchema))));
}
