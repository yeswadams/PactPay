import { handler, ok, parseBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { decideInvoice } from "@/server/services/invoices";
import { reviewSchema } from "@/server/validation";

export const POST = handler(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser("reviewer");
    const { id } = await params;
    const body = parseBody(reviewSchema, await request.json());
    const invoice = await decideInvoice(user, id, body);
    return ok({ invoice });
  },
);
