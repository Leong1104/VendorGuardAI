// Turns a loaded pdf.js document into visual lines (text items grouped by
// y-position, top to bottom). Shared by the browser entry point and the
// Node verification script, which load pdf.js differently. No OCR: a
// scanned PDF without a text layer yields no lines.

import type { PDFDocumentProxy } from "pdfjs-dist";

const LINE_TOLERANCE = 2; // points; items closer than this share a line

export async function linesFromDocument(doc: PDFDocumentProxy): Promise<string[]> {
  const lines: string[] = [];
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
      const needsSpace = current && !current.endsWith(" ") && !item.str.startsWith(" ");
      current += (needsSpace ? " " : "") + item.str;
      lastY = y;
    }
    lines.push(current);
    page.cleanup();
  }
  return lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}
