import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const ACTIONS = {
  block_payment: {
    audit_action: "payment_blocked",
    new_status: "blocked" as const,
  },
  request_bank_verification: {
    audit_action: "bank_verification_requested",
    new_status: null,
  },
  approve: {
    audit_action: "payment_approved",
    new_status: "approved" as const,
  },
} as const;

// Step 8: human review decisions. Every action becomes an audit event with
// the reviewer recorded; block/approve also update the transaction status.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action as keyof typeof ACTIONS;
  if (!ACTIONS[action]) {
    return NextResponse.json(
      { error: `action must be one of: ${Object.keys(ACTIONS).join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: txn } = await supabase
    .from("transactions")
    .select("id, txn_code, status, risk_score, risk_level")
    .eq("id", id)
    .maybeSingle();
  if (!txn) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  const config = ACTIONS[action];
  if (config.new_status) {
    const { error } = await supabase
      .from("transactions")
      .update({ status: config.new_status })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { data: event, error: auditError } = await supabase
    .from("audit_events")
    .insert({
      actor: typeof body.actor === "string" && body.actor ? body.actor : "analyst",
      action: config.audit_action,
      subject_type: "transaction",
      subject_id: id,
      details: {
        txn_code: txn.txn_code,
        risk_score: txn.risk_score,
        risk_level: txn.risk_level,
        previous_status: txn.status,
        new_status: config.new_status ?? txn.status,
        note: typeof body.note === "string" ? body.note : undefined,
      },
    })
    .select()
    .single();
  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 500 });
  }

  return NextResponse.json({
    status: config.new_status ?? txn.status,
    audit_event: event,
  });
}
