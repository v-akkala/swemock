import { describe, expect, it } from "vitest";
import { makePdf } from "../../../e2e/make-pdf";
import { parseResume } from "@swemock/shared";

async function load() {
  return import("./pdf");
}

describe("extractPdfText", () => {
  it("pulls the text out of a PDF, and the result parses like a pasted resume", async () => {
    const { extractPdfText } = await load();
    const pdf = makePdf(["Jordan Rivera", "EXPERIENCE", "Acme Cloud - Intern   Jun 2025 - Aug 2025", "- Improved API latency by 40% with a Redis cache", "SKILLS", "Python, C++"]);
    const text = await extractPdfText(new Uint8Array(pdf));
    expect(text).toContain("Improved API latency by 40% with a Redis cache");
    expect(parseResume(text).bullets.map((b) => b.text)).toContain("Improved API latency by 40% with a Redis cache");
  });

  it("rejects things that aren't PDFs, are too big, or have no text", async () => {
    const { extractPdfText, MAX_PDF_BYTES } = await load();
    await expect(extractPdfText(new TextEncoder().encode("just text, not a pdf"))).rejects.toThrow(/doesn't look like a PDF/);
    await expect(extractPdfText(new Uint8Array(MAX_PDF_BYTES + 1))).rejects.toThrow(/larger than 5 MB/);
    await expect(extractPdfText(new Uint8Array(makePdf([""])))).rejects.toThrow(/No text found/);
    await expect(extractPdfText(new TextEncoder().encode("%PDF-1.4 truncated garbage"))).rejects.toThrow(/Couldn't read/);
  });
});
