// Generates the six fictional VendorGuard demo PDFs into samples/.
// Matches docs/01_Automation_Scenario_Guide.pdf: one purchase by Vertex
// Retail Operations from Nexa Office Solutions, with planted control
// failures (duplicate invoice, wrong bank account, missing PO reference,
// status conflict, overdue invoice). All data is fictional.
//
// Usage: node scripts/generate-sample-pdfs.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const OUT_DIR = new URL("../samples/", import.meta.url).pathname;
mkdirSync(OUT_DIR, { recursive: true });

const SUPPLIER = {
  name: "Nexa Office Solutions Sdn Bhd",
  reg: "202101034567",
  address: "No. 12, Jalan Teknologi 3/5, Kota Damansara, 47810 Petaling Jaya, Selangor",
  phone: "+60 3-6142 8890",
  email: "accounts@nexaoffice.example.my",
  bankVerified: "512233444321", // ends 4321 — the trusted account
  bankFraud: "512233446789", // ends 6789 — planted mismatch
};
const BUYER = {
  name: "Vertex Retail Operations Sdn Bhd",
  address: "Level 18, Menara Vertex, Jalan Ampang, 50450 Kuala Lumpur",
};
const ITEMS = [
  { desc: 'Dell 24" Monitor P2425H', qty: 8, unit: 799.0 },
  { desc: "USB-C Docking Station DX600", qty: 6, unit: 549.8 },
  { desc: "Wireless Keyboard & Mouse Set", qty: 4, unit: 374.5 },
];
const TOTAL = "RM 11,188.80";

const fmt = (n) =>
  "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function makePdf(fileName, { title, font, lines, accent }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const body = await doc.embedFont(font);
  const bold = await doc.embedFont(
    font === StandardFonts.TimesRoman ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold
  );
  let y = 790;

  page.drawText(title, { x: 50, y, size: 20, font: bold, color: accent });
  y -= 14;
  page.drawLine({
    start: { x: 50, y },
    end: { x: 545, y },
    thickness: 1.5,
    color: accent,
  });
  y -= 26;

  for (const line of lines) {
    if (line === "") {
      y -= 12;
      continue;
    }
    const isHeading = line.startsWith("## ");
    const text = isHeading ? line.slice(3) : line;
    page.drawText(text, {
      x: 50,
      y,
      size: isHeading ? 12 : 10,
      font: isHeading ? bold : body,
      color: rgb(0.1, 0.1, 0.15),
    });
    y -= isHeading ? 20 : 15;
  }

  page.drawText("FICTIONAL SAMPLE — DEVLEAGUE 2026 DEMO", {
    x: 50,
    y: 40,
    size: 8,
    font: body,
    color: rgb(0.6, 0.6, 0.6),
  });

  writeFileSync(OUT_DIR + fileName, await doc.save());
  console.log("wrote samples/" + fileName);
}

const itemLines = (withAmount = true) =>
  ITEMS.map(
    (i) =>
      `${i.desc}  —  qty ${i.qty} @ ${fmt(i.unit)}` +
      (withAmount ? `  =  ${fmt(i.qty * i.unit)}` : "")
  );

// 1. Supplier master profile — trusted identity, verified account ...4321
await makePdf("01_supplier_profile.pdf", {
  title: "SUPPLIER MASTER PROFILE",
  font: StandardFonts.Helvetica,
  accent: rgb(0.1, 0.2, 0.45),
  lines: [
    "## Supplier Information",
    `Company Name: ${SUPPLIER.name}`,
    `Registration Number: ${SUPPLIER.reg}`,
    `Address: ${SUPPLIER.address}`,
    `Phone: ${SUPPLIER.phone}`,
    `Email: ${SUPPLIER.email}`,
    "",
    "## Verified Banking Details",
    "Bank: Maybank Berhad",
    `Account Number: ${SUPPLIER.bankVerified}`,
    `Account Name: ${SUPPLIER.name}`,
    "Verification Status: VERIFIED (site visit + bank letter, 12 January 2026)",
    "",
    "## Procurement Notes",
    "Approved supplier for IT equipment and office hardware.",
    "Payment terms: 30 days from invoice date.",
  ],
});

// 2. Purchase order — approved items and total
await makePdf("02_purchase_order.pdf", {
  title: "PURCHASE ORDER",
  font: StandardFonts.Helvetica,
  accent: rgb(0.1, 0.2, 0.45),
  lines: [
    `PO Number: PO-2026-0108`,
    "PO Date: 10 July 2026",
    "",
    "## Buyer",
    BUYER.name,
    BUYER.address,
    "",
    "## Supplier",
    SUPPLIER.name,
    `Registration Number: ${SUPPLIER.reg}`,
    "",
    "## Ordered Items",
    ...itemLines(),
    "",
    `Grand Total: ${TOTAL}`,
    "Currency: Malaysian Ringgit (MYR)",
    "Payment Terms: 30 days from invoice date",
    "Authorized by: Procurement Department, Vertex Retail Operations",
  ],
});

// 3. Original invoice — account ...6789, NO PO reference, UNPAID
await makePdf("03_invoice_original.pdf", {
  title: "TAX INVOICE",
  font: StandardFonts.Helvetica,
  accent: rgb(0.55, 0.1, 0.1),
  lines: [
    `Invoice Number: INV-2026-0182`,
    "Invoice Date: 16 July 2026",
    "Due Date: 15 August 2026",
    "Payment Status: UNPAID",
    "",
    "## From",
    SUPPLIER.name,
    `Registration Number: ${SUPPLIER.reg}`,
    SUPPLIER.address,
    "",
    "## Bill To",
    BUYER.name,
    BUYER.address,
    "",
    "## Items",
    ...itemLines(),
    "",
    `Total Due: ${TOTAL}`,
    "",
    "## Payment Instructions",
    "Bank: Maybank Berhad",
    `Account Number: ${SUPPLIER.bankFraud}`,
    `Account Name: ${SUPPLIER.name}`,
    "Please quote the invoice number when making payment.",
  ],
});

// 4. Reissued invoice — same identity and amount, different layout/hash
await makePdf("04_invoice_reissued.pdf", {
  title: "INVOICE (REISSUED COPY)",
  font: StandardFonts.TimesRoman,
  accent: rgb(0.35, 0.1, 0.4),
  lines: [
    "## Supplier",
    SUPPLIER.name,
    `Reg. No.: ${SUPPLIER.reg}`,
    SUPPLIER.address,
    "",
    "## Invoice Details",
    `Invoice No: INV-2026-0182`,
    "Date of Issue: 16 July 2026",
    "Payment Due: 15 August 2026",
    "Status: UNPAID",
    "",
    "## Customer",
    BUYER.name,
    BUYER.address,
    "",
    "## Description of Goods",
    ...itemLines(),
    "",
    `Amount Payable: ${TOTAL}`,
    "",
    "## Remittance Details",
    "Beneficiary Bank: Maybank Berhad",
    `Beneficiary Account: ${SUPPLIER.bankFraud}`,
    "Note: This invoice replaces the earlier copy sent by email.",
  ],
});

// 5. Delivery order — links PO and invoice, confirms quantities
await makePdf("05_delivery_order.pdf", {
  title: "DELIVERY ORDER",
  font: StandardFonts.Helvetica,
  accent: rgb(0.05, 0.35, 0.2),
  lines: [
    `DO Number: DO-2026-0097`,
    "Delivery Date: 18 July 2026",
    `PO Reference: PO-2026-0108`,
    `Invoice Reference: INV-2026-0182`,
    "",
    "## Deliver To",
    BUYER.name,
    BUYER.address,
    "",
    "## Delivered Items",
    ...itemLines(false),
    "",
    "All items received in good condition.",
    "Received by: Warehouse Supervisor, Vertex Retail Operations",
    `Delivered by: ${SUPPLIER.name}`,
  ],
});

// 6. Payment receipt — claims SETTLED to the unverified account
await makePdf("06_payment_receipt.pdf", {
  title: "OFFICIAL PAYMENT RECEIPT",
  font: StandardFonts.TimesRoman,
  accent: rgb(0.5, 0.3, 0.05),
  lines: [
    `Receipt Number: PAY-2026-0255`,
    "Payment Date: 19 August 2026",
    "",
    "## Received From",
    BUYER.name,
    "",
    "## Payment Details",
    `In settlement of Invoice: INV-2026-0182`,
    `Amount Received: ${TOTAL}`,
    "Payment Method: Bank transfer",
    "Bank: Maybank Berhad",
    `Credited Account: ${SUPPLIER.bankFraud}`,
    "Payment Status: SETTLED",
    "",
    `Issued by: ${SUPPLIER.name}`,
    "Thank you for your payment.",
  ],
});

console.log("done");
