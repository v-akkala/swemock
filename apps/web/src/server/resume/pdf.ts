import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import { ApiError } from "../http/errors";

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 8;

/**
 * Pulls the text out of an uploaded resume PDF (spec §8.1), server-side, so the file never leaves the
 * machine. Scanned (image-only) PDFs have no text layer; those are reported rather than guessed at.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength > MAX_PDF_BYTES) throw new ApiError(413, "That PDF is larger than 5 MB. Paste the text instead.");
  // "%PDF" magic number: anything else isn't a PDF, whatever the file name says.
  if (bytes.byteLength < 5 || String.fromCharCode(...bytes.subarray(0, 4)) !== "%PDF") throw new ApiError(400, "That file doesn't look like a PDF.");
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > MAX_PAGES) throw new ApiError(400, `A resume this long (${pdf.numPages} pages) is probably the wrong file. The limit is ${MAX_PAGES} pages.`);
    const { text } = await extractText(pdf, { mergePages: true });
    const cleaned = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (cleaned.length < 40) throw new ApiError(422, "No text found in that PDF. It may be a scan; paste the text instead.");
    return cleaned;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(422, "Couldn't read that PDF. Paste the text instead.");
  }
}
