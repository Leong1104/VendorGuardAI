import { NextResponse } from "next/server";

import { generateExplanation } from "@/lib/explain";
import type { NormalizedFields } from "@/lib/extract";
import { runControlChecks, type RuleDoc } from "@/lib/rules";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Document, Supplier } from "@/lib/types";

// POST /api/batches/[id]/link — resolve the supplier, link the batch's
// documents into one transaction, run the deterministic control checks, and
// persist the findings with evidence. Idempotent: returns the existing
// transaction if the batch was already linked.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: batchId } = await params;
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("transactions")
    .select("id")
    .eq("batch_id", batchId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ transaction_id: existing.id, existing: true });
  }

  const { data: documents } = await supabase
    .from("documents")
    .select()
    .eq("batch_id", batchId)
    .order("created_at")
    .returns<Document[]>();
  const docs = (documents ?? []).filter((d) => d.normalized);
  if (docs.length === 0) {
    return NextResponse.json(
      { error: "No processed documents in batch — run /process first" },
      { status: 409 }
    );
  }
  // Linking a partially processed batch would silently produce wrong (or
  // missing) findings — refuse instead.
  const unprocessed = (documents ?? []).length - docs.length;
  if (unprocessed > 0) {
    return NextResponse.json(
      {
        error: `${unprocessed} document(s) are not processed yet — re-run /process before linking`,
      },
      { status: 409 }
    );
  }

  const ruleDocs: RuleDoc[] = docs.map((d) => ({
    id: d.id,
    file_name: d.file_name,
    file_hash: d.file_hash,
    normalized: d.normalized as unknown as NormalizedFields,
  }));
  const norms = ruleDocs.map((d) => d.normalized);

  // --- Supplier resolution: registration number first, then canonical name.
  const regNo = norms.map((n) => n.supplier_registration_number).find(Boolean) ?? null;
  const supplierKey = norms.map((n) => n.supplier_key).find(Boolean) ?? null;
  const supplierName = norms.map((n) => n.supplier_name).find(Boolean) ?? "Unknown supplier";
  const profile = norms.find(
    (n) => n.doc_type === "supplier_profile" && n.bank_account_last4
  );

  let supplier: Supplier | null = null;
  if (regNo) {
    const { data } = await supabase
      .from("suppliers")
      .select()
      .eq("registration_number", regNo)
      .maybeSingle<Supplier>();
    supplier = data;
  }
  if (!supplier && supplierKey) {
    const { data } = await supabase
      .from("suppliers")
      .select()
      .eq("normalized_name", supplierKey)
      .maybeSingle<Supplier>();
    supplier = data;
  }
  if (!supplier) {
    const { count } = await supabase
      .from("suppliers")
      .select("*", { count: "exact", head: true });
    const code = `SUP-${String((count ?? 0) + 1).padStart(3, "0")}`;
    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        supplier_code: code,
        registration_number: regNo,
        name: supplierName,
        normalized_name: supplierKey ?? supplierName.toUpperCase(),
        verified_bank_account_masked: profile?.bank_account_masked ?? null,
        verified_bank_last4: profile?.bank_account_last4 ?? null,
      })
      .select()
      .single<Supplier>();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    supplier = data;
  } else if (profile && !supplier.verified_bank_last4) {
    await supabase
      .from("suppliers")
      .update({
        verified_bank_account_masked: profile.bank_account_masked,
        verified_bank_last4: profile.bank_account_last4,
      })
      .eq("id", supplier.id);
  }

  await supabase.from("audit_events").insert({
    actor: "system",
    action: "supplier_resolved",
    subject_type: "supplier",
    subject_id: supplier.id,
    details: {
      batch_id: batchId,
      supplier_code: supplier.supplier_code,
      matched_by: regNo ? "registration_number" : "normalized_name",
      document_count: docs.length,
    },
  });

  // --- Assemble the transaction from cross-document references.
  const poNumber = norms.map((n) => n.po_number).find(Boolean) ?? null;
  const invoiceNumber = norms.map((n) => n.invoice_number).find(Boolean) ?? null;
  const totalAmount = norms.map((n) => n.total_amount).find((v) => v != null) ?? null;
  const currency = norms.map((n) => n.currency).find(Boolean) ?? "MYR";
  const refDigits = (poNumber ?? invoiceNumber ?? batchId).replace(/^[A-Z]+-?/i, "");
  // Re-demos re-upload the same documents; suffix the code if the base is taken.
  const baseCode = `TXN-${refDigits}`;
  const { data: taken } = await supabase
    .from("transactions")
    .select("txn_code")
    .like("txn_code", `${baseCode}%`);
  const txnCode =
    (taken ?? []).length === 0 ? baseCode : `${baseCode}-${(taken ?? []).length + 1}`;

  const { findings, risk_score, risk_level } = runControlChecks(ruleDocs);

  const { data: transaction, error: txnError } = await supabase
    .from("transactions")
    .insert({
      txn_code: txnCode,
      batch_id: batchId,
      supplier_id: supplier.id,
      invoice_number: invoiceNumber,
      po_number: poNumber,
      currency,
      total_amount: totalAmount,
      risk_score,
      risk_level,
    })
    .select()
    .single();
  if (txnError) {
    return NextResponse.json({ error: txnError.message }, { status: 500 });
  }

  const { error: linkError } = await supabase.from("transaction_documents").insert(
    docs.map((d) => ({
      transaction_id: transaction.id,
      document_id: d.id,
      role: d.doc_type,
    }))
  );
  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  if (findings.length > 0) {
    const { error: findingsError } = await supabase.from("findings").insert(
      findings.map((f) => ({ transaction_id: transaction.id, ...f }))
    );
    if (findingsError) {
      return NextResponse.json({ error: findingsError.message }, { status: 500 });
    }
  }

  // Step 7: AI narrates the deterministic findings. Non-fatal on failure —
  // the findings themselves are already persisted and explainable.
  let explanation: string | null = null;
  let explanationModel: string | null = null;
  try {
    const fileNames = new Map(docs.map((d) => [d.id, d.file_name]));
    const generated = await generateExplanation({
      txn_code: txnCode,
      supplier_name: supplier.name,
      supplier_code: supplier.supplier_code,
      invoice_number: invoiceNumber,
      po_number: poNumber,
      currency,
      total_amount: totalAmount,
      verified_account_masked: supplier.verified_bank_account_masked,
      requested_account_masked:
        norms
          .map((n) => n.bank_account_masked)
          .find((m) => m && m !== supplier.verified_bank_account_masked) ?? null,
      risk_score,
      risk_level,
      findings: findings.map((f) => ({
        ...f,
        source_files: [
          ...new Set(f.evidence.map((e) => fileNames.get(e.document_id) ?? e.document_id)),
        ],
      })),
    });
    explanation = generated.text;
    explanationModel = generated.model;
    await supabase
      .from("transactions")
      .update({ explanation })
      .eq("id", transaction.id);
    await supabase.from("audit_events").insert({
      actor: "system",
      action: "explanation_generated",
      subject_type: "transaction",
      subject_id: transaction.id,
      details: { model: explanationModel, finding_count: findings.length },
    });
  } catch {
    // leave explanation null; UI falls back to the raw findings
  }

  await supabase.from("audit_events").insert([
    {
      actor: "system",
      action: "transaction_linked",
      subject_type: "transaction",
      subject_id: transaction.id,
      details: {
        batch_id: batchId,
        txn_code: txnCode,
        document_count: docs.length,
        linked_by: { po_number: poNumber, invoice_number: invoiceNumber, supplier_code: supplier.supplier_code },
      },
    },
    {
      actor: "system",
      action: "risk_scored",
      subject_type: "transaction",
      subject_id: transaction.id,
      details: {
        risk_score,
        risk_level,
        findings: findings.map((f) => ({ rule: f.rule_code, points: f.points })),
      },
    },
  ]);

  return NextResponse.json({
    transaction_id: transaction.id,
    txn_code: txnCode,
    supplier_code: supplier.supplier_code,
    risk_score,
    risk_level,
    findings: findings.length,
  });
}
