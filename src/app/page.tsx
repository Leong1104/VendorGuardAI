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

      <section className="w-full max-w-xl rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">
          How your data is handled{" "}
          <span className="font-normal text-zinc-400">(PDPA Malaysia)</span>
        </h2>
        <dl className="mt-3 grid gap-3 text-xs text-zinc-600 sm:grid-cols-2 dark:text-zinc-300">
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">
              Minimal processing
            </dt>
            <dd className="mt-0.5">
              Only the fields needed for control checks are extracted. Documents
              are analyzed for this batch alone and never used to train models.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">
              PII masked at the source
            </dt>
            <dd className="mt-0.5">
              Bank account numbers are masked during normalization (e.g.{" "}
              ********4321). Full numbers are never stored or displayed.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">
              Private by default
            </dt>
            <dd className="mt-0.5">
              Originals live in private storage with database access denied to
              browsers; every read happens server-side.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">
              You control retention
            </dt>
            <dd className="mt-0.5">
              Delete any batch at any time — files, extracted fields, and
              findings are removed; only a deletion audit record remains.
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
