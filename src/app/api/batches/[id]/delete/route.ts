import { NextResponse } from "next/server";

import { DOCUMENTS_BUCKET, getSupabaseAdmin } from "@/lib/supabase/admin";

// PDPA: the user controls uploaded data. Deleting a batch removes the
// stored PDFs, documents, transactions, and findings; only an audit event
// recording the deletion (no document content) is retained.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: batchId } = await params;
  const supabase = getSupabaseAdmin();

  const { data: batch } = await supabase
    .from("batches")
    .select("id")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const { data: objects } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .list(batchId);
  if (objects && objects.length > 0) {
    const { error: removeError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .remove(objects.map((o) => `${batchId}/${o.name}`));
    if (removeError) {
      return NextResponse.json({ error: removeError.message }, { status: 500 });
    }
  }

  // Transactions reference the batch with on delete set null, so remove them
  // explicitly (findings and transaction_documents cascade from there).
  await supabase.from("transactions").delete().eq("batch_id", batchId);
  const { error: batchError } = await supabase
    .from("batches")
    .delete()
    .eq("id", batchId);
  if (batchError) {
    return NextResponse.json({ error: batchError.message }, { status: 500 });
  }

  await supabase.from("audit_events").insert({
    actor: "analyst",
    action: "batch_deleted",
    subject_type: "batch",
    subject_id: batchId,
    details: { files_removed: objects?.length ?? 0, reason: "user_requested_deletion" },
  });

  return NextResponse.json({ deleted: true, files_removed: objects?.length ?? 0 });
}
