import { NextResponse } from "next/server";

import {
  classifyAndExtract,
  normalizeExtracted,
  redactExtracted,
} from "@/lib/extract";
import { DOCUMENTS_BUCKET, getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Document } from "@/lib/types";

export const maxDuration = 120;

// POST /api/batches/[id]/process — classify, extract, and normalize every
// unprocessed document in the batch. Each document is processed separately
// (one Gemini call per PDF); normalization is deterministic code.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: batchId } = await params;
  const supabase = getSupabaseAdmin();

  const { data: batch } = await supabase
    .from("batches")
    .select()
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const { data: documents, error: docsError } = await supabase
    .from("documents")
    .select()
    .eq("batch_id", batchId)
    .order("created_at")
    .returns<Document[]>();
  if (docsError) {
    return NextResponse.json({ error: docsError.message }, { status: 500 });
  }

  const pending = (documents ?? []).filter((d) => !d.doc_type);
  const results = await Promise.allSettled(
    pending.map(async (doc) => {
      const { data: file, error: downloadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .download(doc.storage_path);
      if (downloadError) throw new Error(downloadError.message);

      const extracted = await classifyAndExtract(
        Buffer.from(await file.arrayBuffer())
      );
      const normalized = normalizeExtracted(extracted);

      const { error: updateError } = await supabase
        .from("documents")
        .update({
          doc_type: extracted.doc_type,
          classification_confidence: Math.min(1, Math.max(0, extracted.confidence)),
          extracted: redactExtracted(extracted),
          normalized,
        })
        .eq("id", doc.id);
      if (updateError) throw new Error(updateError.message);

      await supabase.from("audit_events").insert({
        actor: "system",
        action: "document_classified",
        subject_type: "document",
        subject_id: doc.id,
        details: {
          batch_id: batchId,
          file_name: doc.file_name,
          doc_type: extracted.doc_type,
          confidence: extracted.confidence,
        },
      });

      return { document_id: doc.id, doc_type: extracted.doc_type };
    })
  );

  const failures = results.filter((r) => r.status === "rejected");
  const status = failures.length > 0 ? "failed" : "ready";
  await supabase.from("batches").update({ status }).eq("id", batchId);

  return NextResponse.json({
    batch_id: batchId,
    processed: results.length - failures.length,
    skipped: (documents?.length ?? 0) - pending.length,
    failures: failures.map((f) => String((f as PromiseRejectedResult).reason)),
    status,
  });
}
