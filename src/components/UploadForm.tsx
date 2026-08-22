"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSelect(list: FileList | null) {
    if (!list) return;
    setFiles(Array.from(list));
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0 || busy) return;
    setBusy(true);
    setError(null);

    const form = new FormData();
    for (const file of files) form.append("files", file);

    try {
      const res = await fetch("/api/batches", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
      router.push(`/batches/${data.batch.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-xl space-y-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-xl border-2 border-dashed border-zinc-300 p-10 text-center transition-colors hover:border-zinc-500 dark:border-zinc-700 dark:hover:border-zinc-400"
      >
        <p className="font-medium">Select PDF documents</p>
        <p className="mt-1 text-sm text-zinc-500">
          Supplier profile, PO, invoices, delivery order, payment receipt — up
          to 10 PDFs in one batch
        </p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        hidden
        onChange={(e) => onSelect(e.target.files)}
      />

      {files.length > 0 && (
        <ul className="space-y-1 text-sm">
          {files.map((file) => (
            <li
              key={file.name}
              className="flex justify-between rounded-md bg-zinc-100 px-3 py-2 dark:bg-zinc-800"
            >
              <span>{file.name}</span>
              <span className="text-zinc-500">
                {(file.size / 1024).toFixed(0)} KB
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={files.length === 0 || busy}
        className="w-full rounded-lg bg-zinc-900 py-3 font-medium text-white transition-opacity disabled:opacity-40 dark:bg-white dark:text-zinc-900"
      >
        {busy ? "Uploading…" : `Upload ${files.length || ""} document${files.length === 1 ? "" : "s"}`}
      </button>
    </form>
  );
}
