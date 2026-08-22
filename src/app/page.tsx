import Link from "next/link";

import UploadForm from "@/components/UploadForm";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">VendorGuard AI</h1>
        <p className="mt-2 max-w-md text-zinc-500">
          Upload a batch of accounts-payable PDFs. VendorGuard extracts, links,
          and risk-checks them — every finding traceable to its source document.
        </p>
      </div>
      <UploadForm />
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
      >
        View dashboard →
      </Link>
      <p className="max-w-md text-center text-xs text-zinc-400">
        Documents are stored privately, processed only for this analysis, and
        can be deleted at any time. Bank account numbers and other personal
        data are masked before display (PDPA-aligned).
      </p>
    </main>
  );
}
