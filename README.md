# VendorGuard AI

AI-powered financial document normalization, supplier-risk analysis, and explainable operational insights for DevLeague 2026.

**Stack:** Next.js (full-stack) + Tailwind CSS + Supabase (Postgres, Storage, Auth) + Gemini API

---

## 1. Challenge context

- **Lab:** Domain 1 – Digital Transformation & Operations
- **Challenge:** AI-Powered Financial Report Analysis – Powered by Experian
- **Goal:** Extract and interpret important financial information from PDFs and spreadsheets, identify trends, anomalies, exceptions, and risks, and present clear findings that support faster decisions.

### Official requirements covered

- Extract relevant financial information.
- Analyse trends, patterns, exceptions, and potential risks.
- Generate concise summaries and recommendations.
- Present insights through an intuitive dashboard, report, or conversational interface.
- Demonstrate explainability and transparency.
- Protect personal and confidential data in line with PDPA principles.

### Success criteria

- Innovation and creativity
- Accuracy and quality of insights
- UX and usability
- Scalability and business value
- Privacy, security, and PDPA compliance
- Responsible and ethical AI

---

## 2. Proposed solution

VendorGuard AI helps an operations or finance employee upload several related financial documents, normalize inconsistent formats, connect related records, detect anomalies, and review an explainable supplier-risk assessment.

It is **not** a consumer credit bureau and must not describe its result as an official credit score. It produces an internal, explainable **supplier operational-risk score** based only on uploaded fictional or authorised business data.

### Narrow demonstration problem

Finance teams manually compare purchase orders, invoices, delivery orders, receipts, and spreadsheets. This is slow and may miss:

- Duplicate invoices
- Missing purchase orders or approvals
- Invoice totals that differ from purchase orders
- Supplier or bank-account mismatches
- Overdue payments
- Unusual spending increases
- Missing or low-confidence information

### One-sentence pitch

> VendorGuard AI turns mixed financial PDFs and spreadsheets into one standardized, explainable transaction view so finance teams can detect errors and supplier risks before approving payment.

---

## 3. Demo scenario (fictional)

The primary demo uses a single batch of **six fictional PDFs** for supplier **Nexa Office Solutions**, purchased by **Vertex Retail Operations**:

| Upload order | Document | Role |
| --- | --- | --- |
| 1 | Supplier master profile | Trusted identity, verified bank account ending 4321 |
| 2 | Purchase order `PO-2026-0108` | Approved items, total MYR 11,188.80 |
| 3 | Original invoice `INV-2026-0182` | Requests payment to account ending 6789, omits PO reference |
| 4 | Reissued invoice `INV-2026-0182` | Different layout/file hash, same invoice identity and amount |
| 5 | Delivery order `DO-2026-0097` | Confirms quantities, links PO and invoice |
| 6 | Payment receipt `PAY-2026-0255` | States invoice already settled to the *unverified* account |

**Expected findings and score:**

| Finding | Points |
| --- | --- |
| Duplicate invoice (two PDFs, same invoice number/supplier/amount) | +15 |
| Bank-account mismatch (verified ...4321 vs. requested ...6789) | +20 |
| Payment-status conflict (invoices say UNPAID, receipt says SETTLED) | +15 |
| Missing PO reference on invoices | +10 |
| Overdue invoice (due 2026-08-15, unresolved) | +10 |
| **Total** | **70/100 — High risk** |

**Expected recommendation:** Block additional payment, verify the bank-account change through an approved channel, confirm the existing transfer, mark one invoice as duplicate, update payment status, and record the reviewer decision.

This scenario is the acceptance test for the MVP: if the system reproduces this transaction, these five findings, and this score end-to-end, the core workflow is proven.

---

## 4. MVP scope

### Required for the first working version

1. Upload multiple PDF (and optionally CSV/XLSX) files as one batch.
2. Preserve every original file in Supabase Storage.
3. Classify each file (supplier profile, invoice, purchase order, receipt, delivery order, expense report, financial spreadsheet).
4. Extract relevant fields from each file separately using Gemini.
5. Normalize dates, currencies, amounts, supplier names, reference numbers, and sensitive identifiers.
6. Link documents that belong to the same supplier or transaction.
7. Detect cross-document mismatches and rule violations (deterministic, not AI).
8. Display an explainable risk level and recommended action.
9. Allow a human reviewer to approve, reject, correct, or separate a match.
10. Show a dashboard with totals, risks, exceptions, and trends.

### Add only if the MVP works

- Ask-your-documents chatbot (Gemini + retrieval over stored documents)
- Batch trend charts
- Duplicate detection across previous batches
- Exportable PDF report
- Multilingual summaries
- Email/Slack notifications

---

## 5. Technology stack

| Component | Technology | Notes |
| --- | --- | --- |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS | |
| Backend API | Next.js Route Handlers | No separate backend service |
| Database | Supabase Postgres | |
| File storage | Supabase Storage (private bucket) | One folder per `batch_id` |
| Auth | Supabase Auth | Minimal — single reviewer role is enough for the demo |
| PDF/document understanding | **Gemini API** (native PDF input via `inline_data`, structured `responseSchema` JSON output) | Replaces Textract/Bedrock/pdfplumber — one call per document does classification + extraction + normalization |
| Spreadsheet extraction | `xlsx` (SheetJS) or `papaparse` (Node) | Only needed if CSV/XLSX support is added |
| Schema validation | Zod | TypeScript equivalent of Pydantic |
| Matching / linking / risk scoring | Plain deterministic TypeScript | Not AI — must be reproducible and explainable |
| Charts | Recharts | |
| Deployment | Vercel (frontend + API) | Single deployable app |

### Why this differs from a "textbook enterprise" stack

- No separate Python backend, no AWS Textract/Bedrock, no S3 — everything lives in one Next.js app + Supabase project, which is the fastest path to a working, deployable demo.
- Gemini reads PDFs directly, so there is no dedicated OCR/extraction library. The tradeoff: the "raw layer" below is Gemini's structured output rather than a fully independent deterministic extraction. This is acceptable for a hackathon demo and should be named as a known limitation when presenting.

---

## 6. Three-layer data model

1. **Raw layer** — original file (Supabase Storage) + Gemini's raw structured-output JSON for that file, exactly as returned, with confidence scores.
2. **Normalized layer** — consistent ISO dates, decimal amounts, canonical supplier key, normalized reference numbers, masked sensitive identifiers.
3. **Transaction layer** — linked documents, cross-document comparisons, findings, computed risk score, and reviewer decision.

**Rule:** normalize every document independently first. Only link documents into a transaction after normalized records exist. Never overwrite a conflicting value — always create a finding.

---

## 7. Canonical normalized schema (Zod)

```ts
import { z } from "zod";

export const DocumentType = z.enum([
  "supplier_profile",
  "invoice",
  "purchase_order",
  "receipt",
  "delivery_order",
  "expense_report",
  "financial_spreadsheet",
  "unknown",
]);

export const NormalizedField = z.object({
  raw_value: z.string().nullable(),
  normalized_value: z.union([z.string(), z.number()]).nullable(),
  confidence: z.number().min(0).max(1),
  source_page: z.number().int().nullable(),
});

export const LineItem = z.object({
  description: z.string(),
  quantity: z.number().nullable(),
  unit_price: z.number().nullable(),
  amount: z.number(),
});

export const FinancialDocument = z.object({
  document_id: z.string().uuid(),
  batch_id: z.string().uuid(),
  document_type: DocumentType,
  document_number: z.string().nullable(),
  purchase_order_number: z.string().nullable(),
  supplier_name: z.string().nullable(),
  supplier_key: z.string().nullable(),
  registration_number: z.string().nullable(),
  issue_date: z.string().date().nullable(),
  due_date: z.string().date().nullable(),
  currency: z.string().default("MYR"),
  subtotal: z.number().nullable(),
  tax_amount: z.number().nullable(),
  total_amount: z.number().nullable(),
  payment_status: z.string().nullable(),
  bank_account_masked: z.string().nullable(),
  bank_account_hash: z.string().nullable(),
  approval_status: z.string().nullable(),
  extraction_confidence: z.number().min(0).max(1),
  line_items: z.array(LineItem).default([]),
});

export type FinancialDocument = z.infer<typeof FinancialDocument>;
```

> Store money as integer cents in Postgres, or use `numeric` columns with a decimal library (e.g. `decimal.js`) in application code — plain JS floats are not safe for financial arithmetic.

---

## 8. Supabase schema (core tables)

```sql
create table batches (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'processing',
  created_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  document_type text,
  extraction_confidence numeric,
  raw_extraction jsonb,        -- Gemini's raw structured output
  normalized jsonb,            -- normalized FinancialDocument
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  supplier_key text,
  supplier_name text,
  total_amount numeric,
  currency text default 'MYR',
  risk_score integer not null default 0,
  risk_level text not null default 'low',
  created_at timestamptz not null default now()
);

create table transaction_documents (
  transaction_id uuid not null references transactions(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  primary key (transaction_id, document_id)
);

create table findings (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  finding_type text not null,       -- duplicate_invoice, bank_mismatch, payment_status_conflict, missing_po, overdue, ...
  points integer not null,
  evidence jsonb,                   -- document_ids and fields that support the finding
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  decision text not null,           -- approve, reject, correct, separate, block_payment
  reviewer_name text,
  notes text,
  created_at timestamptz not null default now()
);
```

Enable **Row Level Security** on all tables and restrict sensitive columns (bank account, personal identifiers) by role.

---

## 9. API routes (Next.js Route Handlers)

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/batches` | Create a batch, upload files to Supabase Storage, queue extraction |
| `GET` | `/api/batches/[id]` | Return batch processing progress and documents |
| `GET` | `/api/documents/[id]` | Return raw and normalized fields for one document |
| `POST` | `/api/documents/[id]/reanalyze` | Retry Gemini extraction/normalization |
| `GET` | `/api/transactions/[id]` | Return linked-document comparison and findings |
| `POST` | `/api/links/[id]/review` | Approve, reject, correct, or separate a document link |
| `POST` | `/api/findings/[id]/resolve` | Resolve a risk finding |
| `POST` | `/api/reviews` | Record a reviewer decision (approve/block payment/etc.) |
| `DELETE` | `/api/batches/[id]` | Delete uploaded and derived data |
| `GET` | `/api/dashboard` | Return summary and trend metrics |

---

## 10. Processing pipeline

```
Upload PDFs → Create batch → Store originals in Supabase Storage
  → For each document (parallel): Gemini extraction (classify + extract + normalize)
  → Save raw_extraction + normalized JSON to `documents`
  → Resolve supplier identity (normalized name / registration number → supplier_key)
  → Link documents into a transaction (PO number, invoice number, supplier_key, amount)
  → Run deterministic rule checks → create `findings` rows
  → Compute risk_score = sum(finding.points), risk_level bucket (low/medium/high)
  → If risk_level = high OR any field confidence < threshold → require human review
  → Reviewer approves/rejects/corrects/blocks payment → `reviews` row + audit trail
  → Dashboard aggregates across batches
```

### Deterministic risk rules (must NOT be delegated to the LLM)

| Rule | Trigger | Points |
| --- | --- | --- |
| Duplicate invoice | Two documents share the same normalized invoice number + supplier + amount | +15 |
| Bank-account mismatch | Requested/paid account hash ≠ supplier profile's verified account hash | +20 |
| Payment-status conflict | Invoice status = unpaid while a linked receipt states settled | +15 |
| Missing PO reference | Invoice has no purchase-order number despite a linked PO existing for the same supplier/amount | +10 |
| Overdue invoice | `due_date < today` and payment/status unresolved | +10 |

Risk level bucket example: 0–29 low, 30–59 medium, 60–100 high.

Gemini is used for extraction, classification, and generating a human-readable explanation of findings — never for the arithmetic or the pass/fail matching logic itself.

---

## 11. Gemini extraction contract

- Send each PDF as `inline_data` (base64) in a single request per document.
- Request **structured JSON output** (`responseMimeType: "application/json"`, `responseSchema` matching `FinancialDocument`).
- Prompt must instruct the model to:
  - classify `document_type`,
  - extract every field it can find,
  - return `null` (not guessed values) for anything not present,
  - return a `confidence` (0–1) per field or for the whole document,
  - never invent a PO/invoice number or amount.
- Store the raw Gemini JSON response verbatim in `documents.raw_extraction` before any further processing — this is the audit evidence layer.

---

## 12. Frontend pages

### Upload page
- Drag-and-drop multiple files
- Accepted format/size explanation
- Data-use and retention notice
- Upload progress per file

### Batch-processing page
- One card per document
- Classification, extraction status, confidence
- Clear error and retry state

### Transaction comparison page
- Side-by-side PO / invoice / delivery / payment values
- Green = match, amber = missing value, red = mismatch
- Evidence source (which document, which field) and confidence
- Approve / reject / correct / unlink / block-payment actions

### Dashboard
- Total documents processed
- High-risk transactions
- Missing approvals
- Duplicate invoices
- Overdue amount
- Monthly spending trend (Recharts)
- Top suppliers by value and risk

---

## 13. Privacy, security, and PDPA checklist

- [ ] Process only fields necessary for the analysis.
- [ ] Use fictional data for the public hackathon demo.
- [ ] Never log full bank accounts or personal identifiers.
- [ ] Store secrets in environment variables, never in source code.
- [ ] Restrict Supabase Storage bucket to private + signed URLs.
- [ ] Mask bank accounts, phone numbers, emails, and identifiers in the UI.
- [ ] Use keyed hashes (`bank_account_hash`) for equality matching, not raw values.
- [ ] Apply Row Level Security / role-based access to sensitive columns.
- [ ] Tell users why data is collected and how it is processed (upload page notice).
- [ ] Provide a delete-batch function that removes original and derived data.
- [ ] Define a short retention period for demo data.
- [ ] Keep an audit history of corrections and reviewer decisions (`reviews` table).
- [ ] Route low-confidence or high-risk results to human review, never auto-approve.
- [ ] Never claim AI results are an official credit decision — call it an internal *operational-risk score*.

---

## 14. Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
MATCHING_SECRET=
```

Commit `.env.example`, never commit the real `.env` file. `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` must only be used server-side (Route Handlers), never exposed to the client.

---

## 15. Suggested project structure

```text
vendorguard-ai/
├── app/
│   ├── page.tsx
│   ├── upload/page.tsx
│   ├── batches/[id]/page.tsx
│   ├── transactions/[id]/page.tsx
│   ├── dashboard/page.tsx
│   └── api/
│       ├── batches/route.ts
│       ├── batches/[id]/route.ts
│       ├── documents/[id]/route.ts
│       ├── documents/[id]/reanalyze/route.ts
│       ├── transactions/[id]/route.ts
│       ├── links/[id]/review/route.ts
│       ├── findings/[id]/resolve/route.ts
│       ├── reviews/route.ts
│       └── dashboard/route.ts
├── components/
│   ├── FileUploader.tsx
│   ├── RiskBadge.tsx
│   ├── DocumentComparison.tsx
│   └── TrendChart.tsx
├── lib/
│   ├── supabase/client.ts
│   ├── supabase/server.ts
│   ├── gemini.ts
│   ├── schema.ts        # Zod schemas
│   ├── matching.ts       # linking logic
│   ├── risk.ts            # deterministic risk rules
│   └── masking.ts
├── sample-data/           # the six fictional demo PDFs
├── tests/
├── .env.example
└── README.md
```

---

## 16. Implementation order

### Phase 1 — Working vertical slice
1. Set up Next.js + Tailwind + Supabase project, deploy shell to Vercel.
2. Implement multi-file upload → Supabase Storage → `batches`/`documents` rows.
3. Process one sample invoice through Gemini, store raw + normalized JSON.
4. Display the normalized invoice on the batch page.

### Phase 2 — Multi-document intelligence (the six-PDF demo scenario)
1. Process all six document types (profile, PO, 2 invoices, delivery order, receipt).
2. Add supplier resolution (`supplier_key`).
3. Add document linking into a `transaction`.
4. Add the five deterministic risk rules and compute the 0–100 score.
5. Generate the explanation view with evidence per finding.

### Phase 3 — Presentation quality
1. Dashboard cards + one trend chart.
2. Human review controls (approve/reject/correct/block payment).
3. Masking + delete-batch controls.
4. Test the live Vercel deployment end-to-end with the six sample PDFs.
5. Record the 3-minute demo video.

Do not spend early build time on complex authentication, multiple roles, notifications, or a chatbot — complete the core upload → risk workflow first.

---

## 17. Definition of done

- [ ] Multiple PDFs can be uploaded successfully as one batch.
- [ ] Every original file is retained separately in Supabase Storage.
- [ ] Each file receives a document ID and a classified type.
- [ ] Gemini extraction returns normalized values matching the canonical schema.
- [ ] Raw values and confidence scores remain visible as evidence.
- [ ] The six-PDF demo scenario links correctly into one transaction.
- [ ] All five expected findings are detected with the correct point values (70/100, High).
- [ ] Mismatches create findings instead of being silently overwritten.
- [ ] Financial calculations use safe decimal handling, not raw floats.
- [ ] Sensitive information (bank accounts, identifiers) is masked in the UI.
- [ ] Human review is required before any high-risk transaction is "resolved."
- [ ] Dashboard displays at least one trend and one risk summary.
- [ ] Users can delete an upload batch (removes originals + derived data).
- [ ] Public GitHub repository contains setup instructions.
- [ ] Live Vercel deployment works.
- [ ] Demo video recorded before submission.

---

## 18. Final design principles

1. Normalize documents separately before linking them.
2. Preserve raw values, normalized values, source evidence, and confidence.
3. Use Gemini for extraction, classification, and explanation — never for arithmetic or matching decisions.
4. Use deterministic TypeScript for arithmetic, matching thresholds, validation, and risk rules.
5. Never hide conflicting values — always create a finding.
6. Require human review for low-confidence or high-risk results.
7. Protect sensitive and personal information by default.
8. Demonstrate one narrow workflow (the six-PDF Nexa scenario) completely.
