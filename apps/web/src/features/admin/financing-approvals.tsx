"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatUnits, type Address, type Hex } from "viem";
import { stateNames } from "@pactpay/blockchain";
import { api } from "../wallet/api";
import { useSession } from "../auth/session";
import { useNetwork } from "../wallet/providers";
import { useTransaction } from "../wallet/use-transaction";
import { TransactionLink } from "../wallet/transaction-link";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status";
import { parseAmount, formatAmount, evmAddress } from "@/lib/domain";
import type { InvoicePage } from "@/server/application/invoices";
import type { OfferTerms } from "@pactpay/database";
const amount = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/, "Use at most six decimal places");
const schema = z.object({
  invoiceId: z.uuid(),
  target: amount,
  repayment: amount,
  fee: amount,
  treasury: evmAddress,
  deadline: z.string().min(10),
  maturity: z.string().min(10),
});
type Prepared = { to: Address; data: Hex };
export function FinancingApprovals({ initial }: { initial: InvoicePage }) {
  const network = useNetwork();
  return network ? (
    <Approvals initial={initial} network={network} />
  ) : (
    <ErrorState message="Protocol configuration is missing." />
  );
}
function Approvals({
  initial,
  network,
}: {
  initial: InvoicePage;
  network: NonNullable<ReturnType<typeof useNetwork>>;
}) {
  const query = useQuery({
    queryKey: ["approval-invoices"],
    queryFn: () =>
      api<InvoicePage>("admin/invoices?pageSize=50&status=confirmed"),
    initialData: initial,
    refetchInterval: 10000,
  });
  const auth = useSession();
  const tx = useTransaction(network);
  const queries = useQueryClient();
  const [error, setError] = useState("");
  const [review, setReview] = useState<OfferTerms>();
  const form = useForm<
    z.input<typeof schema>,
    unknown,
    z.output<typeof schema>
  >({
    resolver: zodResolver(schema),
    defaultValues: {
      invoiceId: "",
      target: "",
      repayment: "",
      fee: "",
      treasury: "",
      deadline: "",
      maturity: "",
    },
  });
  const selectedId = useWatch({ control: form.control, name: "invoiceId" });
  const selected = query.data.items.find(
    (invoice) => invoice.id === selectedId,
  );
  const verifier = auth.data?.scopes.includes("verifier");
  const lister = auth.data?.scopes.includes("lister");
  async function sign(
    id: string,
    operation: "approval" | "listing" | "disbursement",
    terms?: OfferTerms,
  ) {
    setError("");
    try {
      const prepared = await api<Prepared>(`invoices/${id}/${operation}`, {
        method: "POST",
        body: JSON.stringify(terms ?? {}),
      });
      await tx.execute(prepared.to, prepared.data);
      await queries.invalidateQueries();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not prepare transaction",
      );
    }
  }
  return (
    <div className="stack">
      <aside className="info-note">
        The verifier approves exact immutable terms. A separate listing role
        opens the offer and disburses only after full funding.
      </aside>
      {query.error && <ErrorState message={query.error.message} />}
      <section className="panel">
        <div className="panel-header">
          <h2>Verified financing requests</h2>
          <Button
            variant="secondary"
            size="sm"
            disabled={tx.busy}
            onClick={async () => {
              try {
                await api("blockchain/sync", { method: "POST", body: "{}" });
                await queries.invalidateQueries();
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not synchronize",
                );
              }
            }}
          >
            Synchronize events
          </Button>
        </div>
        {query.data.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Business</th>
                  <th>Funding target</th>
                  <th>Contract state</th>
                  <th>Authorized action</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoiceNumber}</td>
                    <td>{invoice.businessName}</td>
                    <td>
                      {invoice.terms
                        ? formatAmount(invoice.terms.target)
                        : "Terms not set"}
                    </td>
                    <td>
                      <StatusBadge
                        status={
                          invoice.financing
                            ? stateNames[invoice.financing.state]
                            : "NONE"
                        }
                      />
                    </td>
                    <td>
                      {lister && invoice.financing?.state === 1 && (
                        <ConfirmAction
                          label="Open listing"
                          title="Open this financing offer"
                          description="Eligible investors will be able to contribute to the verifier-approved terms until the deadline."
                          disabled={tx.busy}
                          onConfirm={() => sign(invoice.id, "listing")}
                        />
                      )}
                      {lister && invoice.financing?.state === 3 && (
                        <ConfirmAction
                          label="Disburse financing"
                          title="Send proceeds to the SME"
                          description={`${formatAmount(invoice.terms?.target ?? "0")} will be sent to the approved SME beneficiary. This can happen only once.`}
                          disabled={tx.busy}
                          onConfirm={() => sign(invoice.id, "disbursement")}
                        />
                      )}
                      {!invoice.financing && (
                        <span className="muted">
                          Awaiting verifier transaction
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No verified requests"
            description="Invoices appear here after a human reviewer approves their evidence."
          />
        )}
      </section>
      {verifier && (
        <section className="panel stack">
          <div>
            <h2>Approve on-chain financing terms</h2>
            <p className="small" style={{ marginTop: 6 }}>
              KES invoice amounts do not determine MOCK terms. Enter the agreed
              token amounts explicitly.
            </p>
          </div>
          <form
            className="stack"
            onSubmit={form.handleSubmit((values) => {
              setError("");
              try {
                if (!selected?.beneficiaryAddress)
                  throw new Error(
                    "The SME owner must associate a wallet before financing",
                  );
                setReview({
                  token: network.deployment.token,
                  beneficiary: selected.beneficiaryAddress,
                  treasury: values.treasury,
                  target: parseAmount(values.target, 6),
                  repayment: parseAmount(values.repayment, 6),
                  fee: parseAmount(values.fee, 6),
                  fundingDeadline: Math.floor(
                    new Date(values.deadline).getTime() / 1000,
                  ).toString(),
                  maturity: Math.floor(
                    new Date(values.maturity).getTime() / 1000,
                  ).toString(),
                });
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : "Check the terms",
                );
              }
            })}
          >
            <label>
              Verified invoice
              <select {...form.register("invoiceId")}>
                <option value="">Choose an invoice</option>
                {query.data.items
                  .filter((invoice) => !invoice.financing)
                  .map((invoice) => (
                    <option value={invoice.id} key={invoice.id}>
                      {invoice.invoiceNumber} · {invoice.businessName}
                    </option>
                  ))}
              </select>
              {form.formState.errors.invoiceId && (
                <span className="form-error">Select an invoice</span>
              )}
            </label>
            {selected?.beneficiaryAddress && (
              <p className="small">
                Approved SME beneficiary:{" "}
                <code>{selected.beneficiaryAddress}</code>
              </p>
            )}
            {selected?.terms ? (
              <div className="stack">
                <p className="notice">
                  These terms are already recorded and immutable. A rejected
                  signature can be retried with the original values.
                </p>
                <div className="detail-row">
                  <span>Funding / repayment / fee</span>
                  <strong>
                    {formatAmount(selected.terms.target)} /{" "}
                    {formatAmount(selected.terms.repayment)} /{" "}
                    {formatAmount(selected.terms.fee)}
                  </strong>
                </div>
                <ConfirmAction
                  label="Sign recorded terms"
                  title="Approve the recorded financing offer"
                  description="Your verifier wallet will approve the exact immutable terms previously recorded for this invoice."
                  disabled={tx.busy}
                  onConfirm={() =>
                    sign(selected.id, "approval", selected.terms!)
                  }
                />
              </div>
            ) : (
              <>
                <div className="form-grid">
                  <label>
                    Funding target (MOCK)
                    <input {...form.register("target")} />
                    {form.formState.errors.target && (
                      <span className="form-error">
                        {form.formState.errors.target.message}
                      </span>
                    )}
                  </label>
                  <label>
                    Full repayment (MOCK)
                    <input {...form.register("repayment")} />
                    {form.formState.errors.repayment && (
                      <span className="form-error">
                        {form.formState.errors.repayment.message}
                      </span>
                    )}
                  </label>
                  <label>
                    Fixed platform fee (MOCK)
                    <input {...form.register("fee")} />
                    {form.formState.errors.fee && (
                      <span className="form-error">
                        {form.formState.errors.fee.message}
                      </span>
                    )}
                  </label>
                  <label>
                    Platform treasury
                    <input {...form.register("treasury")} />
                    {form.formState.errors.treasury && (
                      <span className="form-error">
                        Enter a valid EVM address
                      </span>
                    )}
                  </label>
                  <label>
                    Funding deadline
                    <input
                      type="datetime-local"
                      step="1"
                      {...form.register("deadline")}
                    />
                  </label>
                  <label>
                    Contract maturity
                    <input
                      type="datetime-local"
                      step="1"
                      {...form.register("maturity")}
                    />
                  </label>
                </div>
                <Button type="submit" disabled={tx.busy}>
                  Review financing terms
                </Button>
              </>
            )}
          </form>
        </section>
      )}
      {review && selected && (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setReview(undefined);
          }}
        >
          <DialogContent
            title="Confirm immutable financing terms"
            description="Preparing this approval records terms permanently for this offer. Review the beneficiary, treasury and amounts before signing."
          >
            <div className="detail-row">
              <span>Target</span>
              <strong>{formatAmount(review.target)}</strong>
            </div>
            <div className="detail-row">
              <span>Repayment</span>
              <strong>{formatAmount(review.repayment)}</strong>
            </div>
            <div className="detail-row">
              <span>Platform fee</span>
              <strong>{formatAmount(review.fee)}</strong>
            </div>
            <p className="small">
              SME: <code>{review.beneficiary}</code>
            </p>
            <div className="dialog-actions">
              <Button variant="secondary" onClick={() => setReview(undefined)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const terms = review;
                  setReview(undefined);
                  void sign(selected.id, "approval", terms);
                }}
              >
                Record & sign approval
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {tx.phase && <p role="status">{tx.phase}</p>}
      {tx.hash && (
        <p>
          <TransactionLink hash={tx.hash} network={network} />
        </p>
      )}
      {(error || tx.error) && <ErrorState message={error || tx.error} />}
    </div>
  );
}
