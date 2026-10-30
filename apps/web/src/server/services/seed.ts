import { eq } from "drizzle-orm";
import { schema } from "@pactpay/database";
import { db } from "../db";
import { hashPassword } from "../auth";
import type { User } from "../auth";
import {
  createInvoice,
  decideInvoice,
  fundInvoice,
  settleInvoice,
  uploadDocument,
  recordEvent,
} from "./invoices";
import { formatKesCents } from "../http";

export const DEMO_PASSWORD = "pactpay-demo";

const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

export async function seedDemoData() {
  // Idempotent: if the demo SME already exists, report rather than duplicating data.
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, "sme@demo.pactpay"))
    .limit(1);
  if (existing.length > 0) {
    return { seeded: false, message: "Demo data already present — nothing to do." };
  }

  const [reviewer] = await db
    .insert(schema.users)
    .values({
      email: "reviewer@demo.pactpay",
      passwordHash: hashPassword(DEMO_PASSWORD),
      name: "Achieng Opondo",
      role: "reviewer",
    })
    .returning();

  const [sme] = await db
    .insert(schema.users)
    .values({
      email: "sme@demo.pactpay",
      passwordHash: hashPassword(DEMO_PASSWORD),
      name: "June Wanjiku",
      role: "sme",
    })
    .returning();

  await db.insert(schema.businesses).values({
    ownerId: sme.id,
    name: "Wanjiku Fresh Produce Ltd",
    registrationNumber: "CRR/0012345/2026",
  });

  const [investor] = await db
    .insert(schema.users)
    .values({
      email: "investor@demo.pactpay",
      passwordHash: hashPassword(DEMO_PASSWORD),
      name: "Brian Njoroge",
      role: "investor",
    })
    .returning();

  const cents = (kes: number) => kes * 100;

  // Invoice 1 — submitted, awaiting human review.
  await createInvoice(sme as unknown as User, {
    invoiceNumber: "WFP-0001",
    customerName: "GreenBasket Supermarkets",
    customerEmail: "payables@greenbasket.example.ke",
    description:
      "Weekly supply of fresh produce (kale, tomatoes, onions) delivered to 6 GreenBasket branches over the last 30 days under signed supply contract WFP-GB-2026-09.",
    faceValueCents: cents(180_000),
    advanceCents: cents(162_000),
    dueDate: daysFromNow(30),
  });

  // Invoice 2 — the flagship invoice a judge walks from submission to settlement.
  const demo = await createInvoice(sme as unknown as User, {
    invoiceNumber: "WFP-0002",
    customerName: "Nairobi Catering Group",
    customerEmail: "accounts@ncg.example.ke",
    description:
      "Dried grains and legumes supplied for a 90-day corporate catering contract; purchase order NCG-PO-8812 and signed delivery note available.",
    faceValueCents: cents(500_000),
    advanceCents: cents(450_000),
    platformFeeBps: 2000,
    dueDate: daysFromNow(60),
  });

  const poPdf = Buffer.from(
    "PO NCG-PO-8812 | Customer: Nairobi Catering Group | Supplier: Wanjiku Fresh Produce Ltd | Items: dried beans, green grams, maize | Approved 2026-09-30",
    "utf8",
  );
  const deliveryPdf = Buffer.from(
    "Delivery note DN-2214 | Delivered to NCG Isiulu depot 2026-10-06 | Received by: J. Mutiso (signature in physical file) | Invoice WFP-0002",
    "utf8",
  );

  await uploadDocument(
    { name: "purchase-order-NCG-PO-8812.pdf", mimeType: "application/pdf", sizeBytes: poPdf.byteLength, content: poPdf },
    { invoiceId: demo.id, kind: "purchase_order", actor: sme as unknown as User },
  );
  await uploadDocument(
    { name: "delivery-note-DN-2214.pdf", mimeType: "application/pdf", sizeBytes: deliveryPdf.byteLength, content: deliveryPdf },
    { invoiceId: demo.id, kind: "delivery_record", actor: sme as unknown as User },
  );

  await decideInvoice(reviewer as unknown as User, demo.id, {
    decision: "confirmed",
    notes:
      "Customer confirmed by phone; delivery note signed. Business registration verified with BRS extract. No prior financing disclosed.",
  });

  await fundInvoice(investor as unknown as User, demo.id);

  await settleInvoice(sme as unknown as User, demo.id, {});

  await recordEvent({
    invoiceId: demo.id,
    type: "demo.note",
    message:
      "This is a demo invoice. Settlement above is simulated; face value, advance, investor return and platform fee are computed exactly as they would be, but no real money moved.",
  });

  const summary =
    `Seeded 3 demo accounts and 2 invoices. Invoice WFP-0002 (${formatKesCents(500_00000)}) ` +
    "was walked through submission, human confirmation, investor funding and simulated settlement.";

  return {
    seeded: true,
    message: summary,
    accounts: [
      { role: "sme", email: "sme@demo.pactpay", password: DEMO_PASSWORD },
      { role: "reviewer", email: "reviewer@demo.pactpay", password: DEMO_PASSWORD },
      { role: "investor", email: "investor@demo.pactpay", password: DEMO_PASSWORD },
    ],
  };
}
