import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// All database and storage access goes through this service-role client on
// the server. RLS is deny-by-default for every other role, so nothing is
// readable from the browser — masking of PII happens server-side before any
// data is rendered.
let adminClient: SupabaseClient | undefined;

export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secretKey) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY — see .env.example"
      );
    }
    adminClient = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

export const DOCUMENTS_BUCKET = "documents";
