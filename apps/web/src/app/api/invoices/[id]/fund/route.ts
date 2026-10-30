import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { fundInvoice } from "@/server/services/invoices";

export const POST = handler(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser("investor");
    const { id } = await params;

    // Body is optional: the whole advance is financed in this prototype.
    let investorWallet: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.investorWallet === "string")
        investorWallet = body.investorWallet;
    } catch {
      // no body sent — fine
    }

    const invoice = await fundInvoice(user, id, investorWallet);
    return ok({ invoice });
  },
);
