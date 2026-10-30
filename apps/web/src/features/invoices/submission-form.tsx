"use client";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { UploadCloud, FileText, Check, X } from "lucide-react";
import { api } from "../wallet/api";
import { parseAmount, formatKes, invoiceInputSchema } from "@/lib/domain";
import { Button } from "@/components/ui/button";
const amount = z
  .string()
  .regex(
    /^(0|[1-9]\d*)(\.\d{1,2})?$/,
    "Use a KES amount with up to two decimal places",
  )
  .refine((v) => {
    try {
      const n = BigInt(parseAmount(v, 2));
      return n > 0n && n <= 2_000_000_000n;
    } catch {
      return false;
    }
  }, "Enter a positive amount up to KES 20,000,000");
export const invoiceFormSchema = z
  .object({
    invoiceNumber: z
      .string()
      .trim()
      .min(1, "Enter an invoice reference")
      .max(64),
    description: z
      .string()
      .trim()
      .min(10, "Describe the goods or services in at least 10 characters")
      .max(2000),
    faceValue: amount,
    customerName: z.string().trim().min(2, "Enter the customer name").max(160),
    customerEmail: z.union([z.email(), z.literal("")]),
    customerContact: z.string().max(120),
    advance: amount,
    dueDate: z.iso.date("Choose a valid due date"),
  })
  .refine(
    (value) => {
      try {
        return (
          BigInt(parseAmount(value.advance, 2)) <
          BigInt(parseAmount(value.faceValue, 2))
        );
      } catch {
        return false;
      }
    },
    {
      path: ["advance"],
      message: "The advance must be below invoice face value",
    },
  );
type Form = z.infer<typeof invoiceFormSchema>;
const steps = [
  "Invoice details",
  "Customer",
  "Payment terms",
  "Documents",
  "Review",
];
const fields: (keyof Form)[][] = [
  ["invoiceNumber", "description", "faceValue"],
  ["customerName", "customerEmail", "customerContact"],
  ["advance", "dueDate"],
  [],
  [],
];
export function InvoiceSubmissionForm() {
  const form = useForm<Form>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      invoiceNumber: "",
      description: "",
      faceValue: "",
      customerName: "",
      customerEmail: "",
      customerContact: "",
      advance: "",
      dueDate: "",
    },
  });
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("");
  const [draft, setDraft] = useState<string>();
  const key = useRef<string | null>(null);
  const router = useRouter();
  const queries = useQueryClient();
  const values = useWatch({ control: form.control });
  const fieldError = (field: keyof Form) =>
    form.formState.errors[field] && (
      <span className="form-error" role="alert">
        {form.formState.errors[field]?.message}
      </span>
    );
  async function next() {
    setError("");
    if (step === 3 && files.length === 0) {
      setError("Attach at least one supporting document");
      return;
    }
    if (await form.trigger(fields[step], { shouldFocus: true }))
      setStep((value) => Math.min(value + 1, 4));
  }
  async function submit(data: Form) {
    setError("");
    if (!files.length) {
      setStep(3);
      setError("Attach at least one supporting document");
      return;
    }
    try {
      key.current ??= crypto.randomUUID();
      const body = invoiceInputSchema.parse({
        invoiceNumber: data.invoiceNumber,
        description: data.description,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerContact: data.customerContact,
        faceValueCents: parseAmount(data.faceValue, 2),
        advanceCents: parseAmount(data.advance, 2),
        dueDate: data.dueDate,
        idempotencyKey: key.current,
      });
      setPhase("Saving your invoice…");
      const invoiceId =
        draft ??
        (
          await api<{ id: string }>("invoices", {
            method: "POST",
            body: JSON.stringify(body),
          })
        ).id;
      setDraft(invoiceId);
      for (let index = 0; index < files.length; index++) {
        setPhase(`Uploading private document ${index + 1} of ${files.length}…`);
        const upload = new FormData();
        upload.set("file", files[index]);
        upload.set("kind", "other");
        await api(`invoices/${invoiceId}/documents`, {
          method: "POST",
          body: upload,
        });
      }
      setPhase("Submitting for verification…");
      await api(`invoices/${invoiceId}/submit`, { method: "POST", body: "{}" });
      await queries.invalidateQueries();
      router.push(`/app/invoices/${invoiceId}`);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not submit invoice",
      );
      setPhase("");
    }
  }
  return (
    <section className="panel">
      <ol className="wizard-steps" aria-label="Submission progress">
        {steps.map((label, index) => (
          <li
            key={label}
            className={step >= index ? "active" : ""}
            aria-current={step === index ? "step" : undefined}
          >
            <span className="step-number">
              {index < step ? <Check size={12} /> : index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <form className="stack" onSubmit={event => { void form.handleSubmit(submit)(event); }}>
        <div>
          <h2>{steps[step]}</h2>
          <p className="muted small" style={{ marginTop: 5 }}>
            {
              [
                "Start with the invoice you want to finance.",
                "Customer details stay private and are used for verification.",
                "KES values describe your invoice; settlement-token terms are agreed separately.",
                "Upload private PDF, PNG or JPEG evidence. Maximum 5 MB per file.",
                "Check the information before sending it to a human reviewer.",
              ][step]
            }
          </p>
        </div>
        {step === 0 && (
          <fieldset
            disabled={!!draft || form.formState.isSubmitting}
            className="stack"
          >
            <div className="form-grid">
              <label>
                Invoice reference
                <input
                  {...form.register("invoiceNumber")}
                  placeholder="INV-2026-001"
                />
                {fieldError("invoiceNumber")}
              </label>
              <label>
                Invoice face value (KES)
                <input
                  inputMode="decimal"
                  {...form.register("faceValue")}
                  placeholder="500000.00"
                />
                {fieldError("faceValue")}
              </label>
            </div>
            <label>
              Goods or services supplied
              <textarea
                rows={4}
                {...form.register("description")}
                placeholder="Describe the work, goods or services covered by this invoice."
              />
              {fieldError("description")}
            </label>
          </fieldset>
        )}
        {step === 1 && (
          <fieldset
            disabled={!!draft || form.formState.isSubmitting}
            className="stack"
          >
            <label>
              Customer business name
              <input {...form.register("customerName")} />
              {fieldError("customerName")}
            </label>
            <div className="form-grid">
              <label>
                Customer email
                <input type="email" {...form.register("customerEmail")} />
                {fieldError("customerEmail")}
              </label>
              <label>
                Customer contact reference
                <input {...form.register("customerContact")} />
                {fieldError("customerContact")}
              </label>
            </div>
            <p className="info-note">
              Customer identities and supporting evidence are never included in
              blockchain events or investor-facing pages.
            </p>
          </fieldset>
        )}
        {step === 2 && (
          <fieldset
            disabled={!!draft || form.formState.isSubmitting}
            className="stack"
          >
            <div className="form-grid">
              <label>
                Requested early advance (KES)
                <input inputMode="decimal" {...form.register("advance")} />
                {fieldError("advance")}
              </label>
              <label>
                Customer payment due date
                <input type="date" {...form.register("dueDate")} />
                {fieldError("dueDate")}
              </label>
            </div>
            <p className="notice">
              This is a financing request. Approval, settlement currency, fees
              and contractual repayment are set explicitly after verification.
              No exchange rate is implied.
            </p>
          </fieldset>
        )}
        {step === 3 && (
          <div className="stack">
            <label className="upload-zone">
              <UploadCloud size={29} />
              <strong>Choose supporting documents</strong>
              <p className="small">
                Invoice PDF, purchase order, delivery record or contract.
              </p>
              <input
                type="file"
                multiple
                accept="application/pdf,image/png,image/jpeg"
                disabled={form.formState.isSubmitting}
                onChange={(event) => {
                  const selected = Array.from(event.target.files ?? []);
                  if (
                    selected.some((file) => file.size > 5 * 1024 * 1024) ||
                    files.length + selected.length > 20
                  ) {
                    setError("Use at most 20 files, each no larger than 5 MB");
                    return;
                  }
                  setError("");
                  setFiles((current) => [...current, ...selected]);
                  event.target.value = "";
                }}
              />
            </label>
            {files.map((file, index) => (
              <div className="document-row" key={`${file.name}:${index}`}>
                <FileText size={20} />
                <div className="document-name">
                  <strong>{file.name}</strong>
                  <small>
                    {Math.ceil(file.size / 1024)} KB · private upload
                  </small>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${file.name}`}
                  disabled={form.formState.isSubmitting}
                  onClick={() =>
                    setFiles((current) => current.filter((_, i) => i !== index))
                  }
                >
                  <X size={15} />
                </Button>
              </div>
            ))}
          </div>
        )}
        {step === 4 && (
          <div className="stack">
            <dl className="definition-grid">
              <div className="detail-row">
                <span>Invoice</span>
                <strong>{values.invoiceNumber}</strong>
              </div>
              <div className="detail-row">
                <span>Customer</span>
                <strong>{values.customerName}</strong>
              </div>
              <div className="detail-row">
                <span>Face value</span>
                <strong>
                  {values.faceValue
                    ? formatKes(parseAmount(values.faceValue, 2))
                    : "—"}
                </strong>
              </div>
              <div className="detail-row">
                <span>Requested advance</span>
                <strong>
                  {values.advance
                    ? formatKes(parseAmount(values.advance, 2))
                    : "—"}
                </strong>
              </div>
              <div className="detail-row">
                <span>Payment due</span>
                <strong>{values.dueDate}</strong>
              </div>
              <div className="detail-row">
                <span>Supporting documents</span>
                <strong>{files.length}</strong>
              </div>
            </dl>
            <p className="notice">
              Submitting does not guarantee approval or funding. An authorized
              reviewer will inspect the invoice and evidence before financing is
              offered.
            </p>
          </div>
        )}
        {draft && (
          <p className="info-note">
            Your draft is saved. Invoice fields are locked while a failed upload
            or submission is retried. The same request will not create a second
            invoice.
          </p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {phase && (
          <p role="status" className="small">
            {phase}
          </p>
        )}
        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={step === 0 || form.formState.isSubmitting}
            onClick={() => setStep((value) => value - 1)}
          >
            Back
          </Button>
          {step < 4 ? (
            <Button type="button" onClick={next}>
              Continue
            </Button>
          ) : (
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? "Submitting…"
                : "Submit for verification"}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
