/** Shared PDF text extract for Studio vs Stow packing-list detection. */

export async function extractPdfText(bytes: Buffer): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const extracted = await extractText(pdf, { mergePages: true });
  const text = Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text;
  return { text: text ?? "", pages: extracted.totalPages ?? 0 };
}
