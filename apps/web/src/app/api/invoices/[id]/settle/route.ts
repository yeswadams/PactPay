import { handler, ok, parseBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { settleInvoice } from "@/server/services/invoices";
import { settleSchema } from "@/server/validation";

export const POST = handler(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser("sme");
    const { id } = await params;

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // empty body settles at face value
    }
    const input = parseBody(settleSchema, body ?? {});
    const invoice = await settleInvoice(user, id, input);
    return ok({ invoice });
  },
);
