# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository State

This is a hackathon project repo (DevLeague 2026, Lab 1 — "Digital Transformation & Operations"). The challenge specs live in `docs/`.

**Tech stack**: Next.js 16 (App Router, Turbopack, TypeScript, Tailwind CSS 4), Supabase (Postgres + Storage + Auth), deployed on Vercel. Source lives in `src/` with the `@/*` import alias.

## Supabase

- Project: `vendorguard` (ref `kukdgmjbltdopfiucuds`, region ap-southeast-1). Manage via the Supabase MCP tools.
- **Access model**: all DB/storage access is server-side through the service-role client (`src/lib/supabase/admin.ts`, `getSupabaseAdmin()`). RLS is enabled on every table with **no policies** — deny by default. Do not add browser-side Supabase reads without adding proper policies first.
- Tables: `batches`, `documents` (immutable originals + `extracted`/`normalized` jsonb), `suppliers`, `transactions`, `transaction_documents`, `findings` (rule results with `evidence` jsonb provenance), `audit_events`. Domain types mirror these in `src/lib/types.ts`.
- Private storage bucket `documents` holds original PDFs.
- Secrets live in `.env.local` (never committed); `.env.example` is the committed template. `SUPABASE_SECRET_KEY` must be copied from the dashboard by the user.

## Pipeline State

All 8 scenario steps are implemented and verified against `samples/` (six scenario PDFs, regenerate with `node scripts/generate-sample-pdfs.mjs`): upload (`POST /api/batches`) → classify/extract/normalize (`/process`, Gemini + `src/lib/normalize.ts`) → supplier resolution + linking + deterministic checks + AI explanation (`/link`, rules in `src/lib/rules.ts`, narration in `src/lib/explain.ts`) → human review (`/api/transactions/[id]/action`: block_payment, request_bank_verification, approve) with audit trail on the transaction page. PDPA deletion: `/api/batches/[id]/delete` removes files + rows, keeping only the deletion audit event. The batch page auto-runs the pipeline and redirects to `/transactions/[id]`. Expected demo result: TXN-2026-0108, SUP-001, 70/100 high risk, 5 findings. Remaining polish: Vercel deployment, dashboard/history page.

## AI Layer

- **Gemini** (`@google/genai` via `src/lib/gemini.ts`) handles extraction, classification, and explanation only. Risk findings must stay deterministic (rule checks over normalized fields) — never LLM output.
- Always call Gemini through `generateWithFallback()` — it falls through `GEMINI_MODELS` (3.6-flash → 3.5-flash → 3.5-flash-lite → 3.1-flash-lite) on quota/availability errors. The key is on the **paid tier** (upgraded 2026-08-22), so daily caps are no longer the constraint, but keep the fallback for resilience. One demo run costs ~7 calls. `gemini-2.5-flash` is retired for this key; never hardcode model names.

## Commands

```bash
npm run dev     # dev server at http://localhost:3000
npm run build   # production build (also type-checks)
npm run lint    # ESLint
```

No test framework is set up yet — update this when one is added.

## The Challenge

**AI-Powered Financial Report Analysis** (sponsored by Experian). Build a tool that:

- Extracts financial information from PDFs and spreadsheets (structured and unstructured).
- Analyzes for trends, anomalies, exceptions, and risks.
- Generates summaries/recommendations via a dashboard, report, or conversational interface.
- Demonstrates **explainability** — how each insight was derived must be transparent.

Judging criteria: innovation, insight accuracy, UX, scalability/business value, privacy/PDPA compliance, responsible AI use.

### PDPA / Privacy Constraints (Malaysia)

These are hard requirements, not nice-to-haves — factor them into any design decision:

- Process only data needed for the analysis; mask/anonymize/redact PII (e.g. bank accounts shown as `********4321`).
- Give users control over uploaded data (retention and deletion).
- Clearly communicate how data is used and protected.

## Target Demo Scenario: "VendorGuard AI"

`docs/01_Automation_Scenario_Guide.pdf` defines the concrete acceptance test the system must pass — a PDF-only accounts-payable fraud-detection flow. A finance analyst uploads **six fictional PDFs in one batch** (supplier profile, PO, original invoice, reissued duplicate invoice, delivery order, payment receipt) describing one purchase by Vertex Retail Operations from Nexa Office Solutions.

Expected pipeline (each stage should be a distinct, auditable step):

1. Create batch; store originals as immutable records with separate document IDs.
2. Classify each PDF by type.
3. Extract + normalize per document: ISO dates, MYR decimals, canonical supplier key, normalized references, masked bank accounts.
4. Resolve supplier identity (registration number + normalized name → `SUP-001`).
5. Link the six documents into one transaction (`TXN-2026-0108`) via references, amount, supplier, items, dates.
6. Run **deterministic** control checks (not LLM guesses) with an additive risk score:
   - Duplicate invoice (same INV number, different file hash/layout) — +15
   - Bank-account mismatch (verified `...4321` vs requested `...6789`) — +20
   - Payment-status conflict (invoices UNPAID vs receipt SETTLED) — +15
   - Missing PO reference on invoices — +10
   - Overdue invoice — +10
   - Total: **70/100 → High risk, human verification required**
7. Generate an explanation citing evidence from the source PDFs.
8. Human review: Block Payment action, bank-verification request, and an audit event.

The demo is scripted to 3 minutes: upload → classification/normalization → linked transaction + duplicate comparison → explainable risk score with masked fields → block payment + audit trail.

## Design Implications

- Risk findings must come from deterministic rule checks over normalized fields, with the AI layer used for extraction/classification/explanation — this is what "explainability" means for this challenge.
- Every finding needs a pointer back to its source document(s); keep document IDs and provenance throughout the pipeline.
- Bank account numbers and other PII must be masked at the normalization stage, before display.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
