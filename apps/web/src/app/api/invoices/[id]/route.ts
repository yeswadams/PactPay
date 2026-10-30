import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { getInvoiceDetail } from "@/server/services/invoices";

export const GET = handler(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireUser();
    const { id } = await params;
    const detail = await getInvoiceDetail(user, id);
    return ok(detail);
  },
);
