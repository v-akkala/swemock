import { ApiError, handle } from "@/server/http/errors";
import { extractPdfText, MAX_PDF_BYTES } from "@/server/resume/pdf";

export const dynamic = "force-dynamic";

/** Extracts text from an uploaded PDF (multipart, field "file"). Nothing is stored; the browser reviews the text first. */
export function POST(request: Request) {
  return handle(async () => {
    const form = await request.formData().catch(() => {
      throw new ApiError(400, "Upload the PDF as multipart form data.");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Choose a PDF file.");
    if (file.size > MAX_PDF_BYTES) throw new ApiError(413, "That PDF is larger than 5 MB. Paste the text instead.");
    const text = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
    return Response.json({ text, title: file.name.replace(/\.pdf$/i, "").slice(0, 80) });
  });
}
