"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { api } from "../wallet/api";
import { useSession } from "../auth/session";
import { StatusBadge } from "@/components/ui/status";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { DateText } from "@/components/application/date-text";
import { formatKes } from "@/lib/domain";
import type { InvoiceDetail } from "@/server/application/invoices";
const reviewSchema = z.object({
  decision: z.enum(["confirmed", "rejected", "needs_information"]),
  notes: z
    .string()
    .trim()
    .min(10, "Explain your decision in at least 10 characters")
    .max(2000),
  evidenceReference: z
    .string()
    .trim()
    .min(5, "Provide a private verification evidence reference")
    .max(500),
});
export function InvoiceDetailView({ initial }: { initial: InvoiceDetail }) {
  const session = useSession();
  const query = useQuery({
    queryKey: ["invoice", initial.invoice.id],
    queryFn: () => api<InvoiceDetail>(`invoices/${initial.invoice.id}`),
    initialData: initial,
  });
  const queries = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useForm<z.infer<typeof reviewSchema>>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { decision: "confirmed", notes: "", evidenceReference: "" },
  });
  const data = query.data;
  const isVerifier = session.data?.scopes.includes("verifier");
  const canUpload =
    session.data?.organization?.id === data.invoice.businessId &&
    ["draft", "needs_information"].includes(data.invoice.status);
  async function action(callback: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await callback();
      await queries.invalidateQueries();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      {query.error && (
        <ErrorState
          message={query.error.message}
          retry={() => query.refetch()}
        />
      )}
      <div className="two-column">
        <section className="panel stack">
          <div className="panel-header">
            <div>
              <h2>Invoice {data.invoice.invoiceNumber}</h2>
              <p>Private business information</p>
            </div>
            <StatusBadge status={data.invoice.status} />
          </div>
          <dl className="definition-grid">
            <div className="detail-row">
              <span>Face value</span>
              <strong>{formatKes(data.invoice.faceValueCents)}</strong>
            </div>
            <div className="detail-row">
              <span>Requested advance</span>
              <strong>{formatKes(data.invoice.advanceCents)}</strong>
            </div>
            <div className="detail-row">
              <span>Customer</span>
              <strong>{data.invoice.customerName}</strong>
            </div>
            <div className="detail-row">
              <span>Payment due</span>
              <strong>
                <DateText value={data.invoice.dueDate} />
              </strong>
            </div>
            <div className="detail-row">
              <span>Customer email</span>
              <strong>{data.invoice.customerEmail || "Not provided"}</strong>
            </div>
            <div className="detail-row">
              <span>Contact reference</span>
              <strong>{data.invoice.customerContact || "Not provided"}</strong>
            </div>
          </dl>
          <div>
            <h3>Goods or services</h3>
            <p className="small" style={{ marginTop: 8 }}>
              {data.invoice.description}
            </p>
          </div>
          {data.invoice.terms && (
            <div>
              <h3>Approved settlement terms</h3>
              <p className="small">
                Token base units, recorded separately from KES invoice amounts.
              </p>
              <div className="detail-row">
                <span>Funding target</span>
                <code>{data.invoice.terms.target}</code>
              </div>
              <div className="detail-row">
                <span>Contractual repayment</span>
                <code>{data.invoice.terms.repayment}</code>
              </div>
              <div className="detail-row">
                <span>Fixed platform fee</span>
                <code>{data.invoice.terms.fee}</code>
              </div>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Verification timeline</h2>
            <ShieldCheck size={18} />
          </div>
          {data.history.length ? (
            <ol className="timeline">
              {data.history.map((event) => (
                <li key={event.id}>
                  <p>{event.message}</p>
                  <small>
                    <DateText value={event.createdAt} />
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="small">
              Your saved draft has not been submitted for review yet.
            </p>
          )}
        </section>
      </div>
      <section className="panel stack">
        <div>
          <h2>Supporting documents</h2>
          <p className="small" style={{ marginTop: 6 }}>
            Private downloads require your organization membership or
            verification permission.
          </p>
        </div>
        {data.documents.map((doc) => (
          <div className="document-row" key={doc.id}>
            <FileText size={20} />
            <div className="document-name">
              <strong>{doc.fileName}</strong>
              <small>
                {Math.ceil(doc.sizeBytes / 1024)} KB ·{" "}
                <DateText value={doc.uploadedAt} />
              </small>
            </div>
            <Button asChild variant="secondary" size="sm">
              <a
                href={`/api/v1/invoices/${data.invoice.id}/documents/${doc.id}`}
              >
                <Download size={14} /> Download
              </a>
            </Button>
          </div>
        ))}
        {!data.documents.length && (
          <p className="small">No documents have been uploaded.</p>
        )}
        {canUpload && (
          <div className="stack">
            <label>
              Add a private document
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void action(async () => {
                    const body = new FormData();
                    body.set("file", file);
                    body.set("kind", "other");
                    await api(`invoices/${data.invoice.id}/documents`, {
                      method: "POST",
                      body,
                    });
                  });
                }}
              />
            </label>
            <Button
              disabled={busy || !data.documents.length}
              onClick={() =>
                action(async () => {
                  await api(`invoices/${data.invoice.id}/submit`, {
                    method: "POST",
                    body: "{}",
                  });
                })
              }
            >
              Submit documents for review
            </Button>
          </div>
        )}
      </section>
      {isVerifier && data.invoice.status === "submitted" && (
        <section className="panel">
          <h2>Record verification decision</h2>
          <p className="small" style={{ margin: "6px 0 20px" }}>
            Review the evidence and customer confirmation before approving. This
            does not create an on-chain listing.
          </p>
          <form
            className="stack"
            onSubmit={form.handleSubmit((values) =>
              action(async () => {
                await api(`invoices/${data.invoice.id}/review`, {
                  method: "POST",
                  body: JSON.stringify(values),
                });
              }),
            )}
          >
            <label>
              Decision
              <select {...form.register("decision")}>
                <option value="confirmed">Approve verification</option>
                <option value="needs_information">
                  Request additional information
                </option>
                <option value="rejected">Reject invoice</option>
              </select>
            </label>
            <label>
              Decision reason
              <textarea rows={3} {...form.register("notes")} />
              {form.formState.errors.notes && (
                <span className="form-error">
                  {form.formState.errors.notes.message}
                </span>
              )}
            </label>
            <label>
              Private evidence reference
              <input {...form.register("evidenceReference")} />
              {form.formState.errors.evidenceReference && (
                <span className="form-error">
                  {form.formState.errors.evidenceReference.message}
                </span>
              )}
            </label>
            <Button disabled={busy}>Record decision</Button>
          </form>
        </section>
      )}
      {error && <ErrorState message={error} />}
    </div>
  );
}
