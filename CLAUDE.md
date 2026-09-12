# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository State

This is an archived hackathon project (DevLeague 2026, Lab 1 — "Digital Transformation & Operations"). The challenge specs live in `docs/`. The hackathon is over; the code was reworked afterwards into a **self-contained static site with no backend, database, AI API, or secrets**. The original Supabase + Gemini build is in git history up to commit `cb60b7a` — do not reintroduce those dependencies.

**Tech stack**: Next.js 16 (App Router, Turbopack, TypeScript, Tailwind CSS 4) with `output: "export"`, pdf.js (`pdfjs-dist`) for text extraction, IndexedDB for persistence. Source lives in `src/` with the `@/*` import alias. Deployed to Vercel as static files.

## Architecture

Everything runs client-side. There are no API routes and no server components that read data.

- `src/lib/db.ts` — IndexedDB wrapper; one object store per former Postgres table (`batches`, `documents`, `files` for PDF bytes, `suppliers`, `transactions`, `transaction_documents`, `findings`, `audit_events`). Domain types in `src/lib/types.ts`. Whole-table reads filtered in JS — volumes are tiny.
- `src/lib/pipeline.ts` — the eight scenario steps as functions over the store: `createBatch` → `processBatch` → `linkBatch` → `reviewAction`, plus `deleteBatch` (PDPA, keeps only the deletion audit event) and `eraseAllData`. Each mirrors a former API route and records the same audit events.
- `src/lib/pdf-text.ts` (browser, Web Worker via `new URL(...)`) and `src/lib/pdf-lines.ts` (shared line grouping) — text-layer extraction. No OCR; scanned PDFs classify as `unknown`.
- `src/lib/extract-local.ts` — label-driven classification (`Label: value` lines) and field extraction. Deliberately strict: a PO reference counts only when labelled as one, so the missing-PO rule fires on the sample invoices. Returns `null` rather than guessing.
- `src/lib/fields.ts` + `src/lib/normalize.ts` — deterministic normalization; bank accounts are masked here and the raw number is never persisted.
- `src/lib/rules.ts` — the five control checks and additive score. Must stay deterministic.
- `src/lib/explain-local.ts` — template narrative from the rule output; the audit event records `model: "local-template"` and the transaction page labels it "Rule-generated".
- Pages are client components using `src/lib/use-query.ts`. Static export cannot prerender dynamic segments, so detail pages take the id as a query string: `/batch?id=…`, `/transaction?id=…`.

Expected demo result with `samples/` (regenerate with `node scripts/generate-sample-pdfs.mjs`): TXN-2026-0108, SUP-001, 70/100 high risk, 5 findings. `npx tsx scripts/verify-local-pipeline.ts` asserts this in Node; the same flow was also verified in headless Chromium end to end (upload → findings → block payment → delete → erase).

## Commands

```bash
npm run dev     # dev server at http://localhost:3000
npm run build   # static export to out/ (also type-checks)
npm run lint    # ESLint
npx tsx scripts/verify-local-pipeline.ts   # extraction + rules over samples/
```

No test framework beyond the verify script is set up — update this when one is added.

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

- Risk findings must come from deterministic rule checks over normalized fields — this is what "explainability" means for this challenge. (During the hackathon an AI layer did extraction/classification/explanation; the archived build makes those deterministic as well.)
- Every finding needs a pointer back to its source document(s); keep document IDs and provenance throughout the pipeline.
- Bank account numbers and other PII must be masked at the normalization stage, before display.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
