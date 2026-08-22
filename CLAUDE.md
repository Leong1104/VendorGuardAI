# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository State

This is a hackathon project repo (DevLeague 2026, Lab 1 — "Digital Transformation & Operations"). It currently contains **no code** — only the challenge specs in `docs/` and a README. When code is added, update this file with actual build/run/test commands.

**Chosen tech stack**: Next.js (App Router), Supabase (Postgres + Storage + Auth), deployed on Vercel.

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
