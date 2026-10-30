import { handler, ApiError } from "@/server/http";
import { User, requireUser } from "@/server/auth";
import { getDocument } from "@/server/services/invoices";

export const GET = handler(
  async (_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) => {
    const user: User = await requireUser();
    const { id, docId } = await params;

    // getDocument resolves access through getAccessibleInvoice (owner / reviewer / eligible investor)
    // and throws a 404 when the document does not belong to this invoice.
    const doc = await getDocument(user, id, docId);
    if (!doc) throw new ApiError(404, "Document not found");

    const bytes = new Uint8Array(doc.content);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `attachment; filename="${doc.fileName.replace(/"/g, "")}"`,
        "Content-Length": String(bytes.byteLength),
      },
    });
  },
);
