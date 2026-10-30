import { handler, ok, parseBody, ApiError } from "@/server/http";
import { requireUser } from "@/server/auth";
import {
  createInvoice,
  listInvoices,
  listInvestorCatalog,
} from "@/server/services/invoices";
import { createInvoiceSchema } from "@/server/validation";
import type { schema } from "@pactpay/database";

type InvoiceStatus = (typeof schema.invoices.$inferSelect)["status"];
export type { InvoiceStatus };

const STATUS_VALUES: InvoiceStatus[] = [
  "submitted",
  "confirmed",
  "rejected",
  "funded",
  "settled",
];

function statusFromQuery(request: Request): InvoiceStatus | undefined {
  const statusParam = new URL(request.url).searchParams.get("status");
  if (!statusParam) return undefined;
  if (!STATUS_VALUES.includes(statusParam as InvoiceStatus)) {
    throw new ApiError(400, `Unknown status "${statusParam}"`);
  }
  return statusParam as InvoiceStatus;
}

export const GET = handler(async (request: Request) => {
  const user = await requireUser();
  const status = statusFromQuery(request);

  if (user.role === "investor" && !status) {
    // Investor default view: verified invoices ready to finance.
    return ok({ invoices: await listInvestorCatalog() });
  }

  return ok({ invoices: await listInvoices(user, status) });
});

export const POST = handler(async (request: Request) => {
  const user = await requireUser("sme");
  const body = parseBody(createInvoiceSchema, await request.json());
  const invoice = await createInvoice(user, body);
  return ok({ invoice }, 201);
});
