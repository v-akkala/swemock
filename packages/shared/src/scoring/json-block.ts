/**
 * Pasted chatbot replies end with one fenced ```json block (spec §2.4). This finds the last such block
 * (or, failing that, a bare JSON object at the end) and parses it.
 */
export type JsonBlockResult = { ok: true; value: unknown; raw: string } | { ok: false; error: string; raw: string | null };

export function extractJsonBlock(text: string): JsonBlockResult {
  const fences = [...text.matchAll(/```(?:json|JSON)?[ \t]*\r?\n([\s\S]*?)```/g)];
  let raw: string | null = fences.length ? fences[fences.length - 1]![1]!.trim() : null;
  if (raw === null) {
    const start = text.lastIndexOf("\n{") >= 0 ? text.lastIndexOf("\n{") + 1 : text.trimStart().startsWith("{") ? text.indexOf("{") : -1;
    if (start >= 0) raw = text.slice(start).trim();
  }
  if (raw === null) return { ok: false, error: "No ```json block found at the end of the reply.", raw: null };
  try {
    return { ok: true, value: JSON.parse(raw), raw };
  } catch (e) {
    return { ok: false, error: `The JSON block doesn't parse: ${(e as Error).message}`, raw };
  }
}
