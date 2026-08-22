import Link from "next/link";
import { notFound } from "next/navigation";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Batch, Document } from "@/lib/types";

export const dynamic = "force-dynamic";

const DOC_TYPE_LABELS: Record<string, string> = {
  supplier_profile: "Supplier profile",
  purchase_order: "Purchase order",
  invoice: "Invoice",
  delivery_order: "Delivery order",
  payment_receipt: "Payment receipt",
  unknown: "Unknown",
};

export default async function BatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: batch } = await supabase
    .from("batches")
    .select()
    .eq("id", id)
    .maybeSingle<Batch>();
  if (!batch) notFound();

  const { data: documents } = await supabase
    .from("documents")
    .select()
    .eq("batch_id", id)
    .order("created_at")
    .returns<Document[]>();

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 p-8">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← New batch
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Batch</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {batch.id} · status:{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {batch.status}
          </span>{" "}
          · uploaded {new Date(batch.created_at).toLocaleString()}
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium">
          Documents ({documents?.length ?? 0})
        </h2>
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {(documents ?? []).map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{doc.file_name}</p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {doc.id} · sha256 {doc.file_hash.slice(0, 12)}…
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs dark:bg-zinc-800">
                {doc.doc_type
                  ? DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type
                  : "Not classified yet"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
