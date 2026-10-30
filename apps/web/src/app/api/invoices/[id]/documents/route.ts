import { z } from "zod";
import { eq } from "drizzle-orm";
import { schema } from "@pactpay/database";
import { db } from "@/server/db";
import { handler, ok, ApiError } from "@/server/http";
import { requireUser } from "@/server/auth";
import { getAccessibleInvoice, uploadDocument } from "@/server/services/invoices";

const kindSchema = z.enum(["purchase_order", "contract", "delivery_record", "other"]);

export const GET = handler(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;
    const { invoice } = await getAccessibleInvoice(user, id);

    const documents = await db
      .select({
        id: schema.invoiceDocuments.id,
        kind: schema.invoiceDocuments.kind,
        fileName: schema.invoiceDocuments.fileName,
        mimeType: schema.invoiceDocuments.mimeType,
        sizeBytes: schema.invoiceDocuments.sizeBytes,
        sha256: schema.invoiceDocuments.sha256,
        uploadedAt: schema.invoiceDocuments.uploadedAt,
      })
      .from(schema.invoiceDocuments)
      .where(eq(schema.invoiceDocuments.invoiceId, invoice.id));

    return ok({ documents });
  },
);

export const POST = handler(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser(["sme"]);
    const { id } = await params;

    const form = await request.formData();
    const kindRaw = String(form.get("kind") ?? "other");
    const kindParsed = kindSchema.safeParse(kindRaw);
    if (!kindParsed.success) {
      throw new ApiError(400, `Unknown document kind "${kindRaw}"`);
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Attach a file under the 'file' field");

    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await uploadDocument(
      { name: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: buffer.byteLength, content: buffer },
      { invoiceId: id, kind: kindParsed.data, actor: user },
    );

    return ok({ document }, 201);
  },
);
