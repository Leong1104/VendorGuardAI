// Browser text-layer extraction. pdf.js parses in a Web Worker; the worker
// script is emitted as a static asset by the bundler via `new URL(...)`.

import { linesFromDocument } from "@/lib/pdf-lines";

export async function extractPdfLines(pdf: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }
  // pdf.js insists on a plain Uint8Array view (not a Buffer subclass).
  const data = new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
  const task = pdfjs.getDocument({ data });
  try {
    return await linesFromDocument(await task.promise);
  } finally {
    await task.destroy();
  }
}
