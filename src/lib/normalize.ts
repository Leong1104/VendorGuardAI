// Deterministic normalization of extracted document fields. Everything here
// is plain code — no AI — so normalized values are reproducible and the rule
// checks built on them are explainable.

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Parse common Malaysian document date formats to ISO yyyy-mm-dd. */
export function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();

  // Already ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // 15/08/2026 or 15-08-2026 (day first)
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }

  // 15 August 2026 / 15 Aug 2026 / August 15, 2026
  const dayFirst = s.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
  const monthFirst = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  const m = dayFirst
    ? { day: dayFirst[1], month: dayFirst[2], year: dayFirst[3] }
    : monthFirst
      ? { day: monthFirst[2], month: monthFirst[1], year: monthFirst[3] }
      : null;
  if (m) {
    const month = MONTHS[m.month.slice(0, 3).toLowerCase()];
    if (month) return `${m.year}-${month}-${m.day.padStart(2, "0")}`;
  }

  return null;
}

/** Parse "RM 11,188.80", "MYR11188.8", "11,188.80" to a 2-decimal number. */
export function normalizeAmount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/rm|myr/gi, "").replace(/[,\s]/g, "");
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/** RM / MYR / Malaysian Ringgit → MYR. */
export function normalizeCurrency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (s === "RM" || s === "MYR" || s.includes("RINGGIT")) return "MYR";
  return s || null;
}

/** Uppercase, trim, collapse internal whitespace: "inv 2026-0182 " → "INV 2026-0182". */
export function normalizeRef(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, " ");
  return s || null;
}

const COMPANY_SUFFIXES =
  /\b(SDN\.?\s*BHD\.?|BHD\.?|BERHAD|ENTERPRISE|PLT|LLP|LTD\.?|LIMITED|INC\.?)\b/g;

/** Canonical supplier key: uppercase, no punctuation, legal suffixes removed. */
export function canonicalSupplierKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = name
    .toUpperCase()
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return key || null;
}

/** Payment status words → UNPAID | PAID | SETTLED | PARTIAL. */
export function normalizePaymentStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (/SETTLED|COMPLETED|SUCCESSFUL/.test(s)) return "SETTLED";
  if (/UNPAID|OUTSTANDING|DUE|PENDING/.test(s)) return "UNPAID";
  if (/PARTIAL/.test(s)) return "PARTIAL";
  if (/PAID/.test(s)) return "PAID";
  return s || null;
}

export interface MaskedAccount {
  masked: string; // ********4321
  last4: string;
}

/**
 * PDPA: bank account numbers never leave normalization unmasked. Only the
 * masked form and last four digits are stored or displayed.
 */
export function maskBankAccount(raw: string | null | undefined): MaskedAccount | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return null;
  const last4 = digits.slice(-4);
  return { masked: `********${last4}`, last4 };
}
