import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { DOCUMENTS_BUCKET, getSupabaseAdmin } from "@/lib/supabase/admin";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// POST /api/batches — accepts multipart form data with one or more PDFs,
// stores the originals immutably in the private bucket, and creates the
// batch + document rows.
export async function POST(request: Request) {
  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `At most ${MAX_FILES} files per batch` },
      { status: 400 }
    );
  }
  for (const file of files) {
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: `${file.name} is not a PDF` },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `${file.name} exceeds 10 MB` },
        { status: 400 }
      );
    }
  }

  const supabase = getSupabaseAdmin();

  const { data: batch, error: batchError } = await supabase
    .from("batches")
    .insert({})
    .select()
    .single();
  if (batchError) {
    return NextResponse.json({ error: batchError.message }, { status: 500 });
  }

  const documents = [];
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    const documentId = crypto.randomUUID();
    const storagePath = `${batch.id}/${documentId}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(storagePath, bytes, { contentType: "application/pdf" });
    if (uploadError) {
      await supabase.from("batches").update({ status: "failed" }).eq("id", batch.id);
      return NextResponse.json(
        { error: `Upload failed for ${file.name}: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: document, error: docError } = await supabase
      .from("documents")
      .insert({
        id: documentId,
        batch_id: batch.id,
        file_name: file.name,
        storage_path: storagePath,
        file_hash: fileHash,
        size_bytes: file.size,
      })
      .select()
      .single();
    if (docError) {
      await supabase.from("batches").update({ status: "failed" }).eq("id", batch.id);
      return NextResponse.json(
        { error: `Record failed for ${file.name}: ${docError.message}` },
        { status: 500 }
      );
    }
    documents.push(document);
  }

  await supabase.from("audit_events").insert({
    actor: "analyst",
    action: "batch_created",
    subject_type: "batch",
    subject_id: batch.id,
    details: {
      file_count: documents.length,
      file_names: documents.map((d) => d.file_name),
    },
  });

  return NextResponse.json({ batch, documents }, { status: 201 });
}
