import UploadForm from "@/components/UploadForm";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-6 py-14">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Accounts-payable fraud detection
        </span>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          Catch invoice fraud before payment
        </h1>
        <p className="mx-auto mt-3 max-w-md text-zinc-500">
          Upload a batch of AP documents. VendorGuard extracts, links, and
          risk-checks them with deterministic controls — every finding
          traceable to its source PDF.
        </p>
      </div>

      <div className="w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <UploadForm />
      </div>

      <section className="w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold">
          How your data is handled{" "}
          <span className="font-normal text-zinc-400">(PDPA Malaysia)</span>
        </h2>
        <dl className="mt-4 grid gap-4 text-xs text-zinc-600 sm:grid-cols-2 dark:text-zinc-300">
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">
              Minimal processing
            </dt>
            <dd className="mt-1 leading-relaxed">
              Only the fields needed for control checks are extracted. Documents
              are analyzed for this batch alone and never used to train models.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">
              PII masked at the source
            </dt>
            <dd className="mt-1 leading-relaxed">
              Bank account numbers are masked during normalization (e.g.{" "}
              <span className="font-mono">********4321</span>). Full numbers are
              never stored or displayed.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">
              Private by default
            </dt>
            <dd className="mt-1 leading-relaxed">
              Originals live in private storage with database access denied to
              browsers; every read happens server-side.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">
              You control retention
            </dt>
            <dd className="mt-1 leading-relaxed">
              Delete any batch at any time — files, extracted fields, and
              findings are removed; only a deletion audit record remains.
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
