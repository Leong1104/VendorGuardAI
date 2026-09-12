// Text-layer extraction with pdf.js. Returns the document as visual lines
// (text items grouped by their y-position, top to bottom), which is what the
// local field parser works on. No OCR: scanned PDFs without a text layer
// come back empty and classify as "unknown".

const LINE_TOLERANCE = 2; // points; items closer than this share a line

export async function extractPdfLines(pdf: Uint8Array): Promise<string[]> {
  // The legacy build runs in Node without a DOM; the dynamic import keeps
  // pdf.js out of any bundle that never processes a PDF.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdf.js rejects Buffer (a Uint8Array subclass); hand it a plain view.
  const data = new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await task.promise;

  const lines: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();

      let current = "";
      let lastY: number | null = null;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > LINE_TOLERANCE) {
          lines.push(current);
          current = "";
        }
        const needsSpace =
          current && !current.endsWith(" ") && !item.str.startsWith(" ");
        current += (needsSpace ? " " : "") + item.str;
        lastY = y;
      }
      lines.push(current);
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }

  return lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}
