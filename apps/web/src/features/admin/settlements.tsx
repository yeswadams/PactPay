"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { financingAbi, stateNames } from "@pactpay/blockchain";
import { useNetwork } from "../wallet/providers";
import { useTransaction } from "../wallet/use-transaction";
import { TransactionLink } from "../wallet/transaction-link";
import { api } from "../wallet/api";
import { StatusBadge } from "@/components/ui/status";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/domain";
import type { InvoicePage } from "@/server/application/invoices";
export type Reconciliations = {
  items: {
    id: string;
    invoiceId: string;
    evidenceReference: string;
    evidenceCommitment: string;
    amount: string;
    status: string;
    transactionHash: string | null;
  }[];
  total: number;
  page: number;
  pageSize: number;
};
const schema = z.object({
  invoiceId: z.uuid("Select a disbursed invoice"),
  evidenceReference: z
    .string()
    .trim()
    .min(8, "Provide supporting collection evidence")
    .max(500),
});
export function SettlementOperations({
  initialInvoices,
  initialRecords,
}: {
  initialInvoices: InvoicePage;
  initialRecords: Reconciliations;
}) {
  const network = useNetwork();
  return network ? (
    <Operations
      invoices={initialInvoices}
      records={initialRecords}
      network={network}
    />
  ) : (
    <ErrorState message="Contract configuration is unavailable." />
  );
}
function Operations({
  invoices,
  records,
  network,
}: {
  invoices: InvoicePage;
  records: Reconciliations;
  network: NonNullable<ReturnType<typeof useNetwork>>;
}) {
  const query = useQuery({
    queryKey: ["settlement-invoices"],
    queryFn: () =>
      api<InvoicePage>("admin/invoices?pageSize=50&status=confirmed"),
    initialData: invoices,
    refetchInterval: 10000,
  });
  const reconciliations = useQuery({
    queryKey: ["reconciliations"],
    queryFn: () => api<Reconciliations>("settlements?pageSize=50"),
    initialData: records,
    refetchInterval: 10000,
  });
  const queries = useQueryClient();
  const tx = useTransaction(network);
  const [error, setError] = useState("");
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { invoiceId: "", evidenceReference: "" },
  });
  const selectedId = useWatch({ control: form.control, name: "invoiceId" });
  const selected = query.data.items.find(
    (invoice) => invoice.id === selectedId,
  );
  const eligible = query.data.items.filter((invoice) =>
    [4, 5].includes(invoice.financing?.state ?? 0),
  );
  return (
    <div className="stack">
      <aside className="notice">
        Reconcile actual off-chain collection evidence before preparing a full
        deposit. A database record alone never marks repayment as received.
      </aside>
      <section className="panel">
        <h2>Prepare a reconciled repayment</h2>
        <form
          className="stack"
          style={{ marginTop: 20 }}
          onSubmit={form.handleSubmit(async (values) => {
            setError("");
            try {
              if (!selected?.terms)
                throw new Error("Select a disbursed financing offer");
              await api("settlements", {
                method: "POST",
                body: JSON.stringify({
                  invoiceId: values.invoiceId,
                  amount: selected.terms.repayment,
                  evidenceReference: values.evidenceReference,
                }),
              });
              await queries.invalidateQueries();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not prepare repayment",
              );
            }
          })}
        >
          <label>
            Disbursed invoice
            <select {...form.register("invoiceId")}>
              <option value="">Choose an invoice</option>
              {eligible.map((invoice) => (
                <option value={invoice.id} key={invoice.id}>
                  {invoice.invoiceNumber} · {invoice.businessName}
                </option>
              ))}
            </select>
            {form.formState.errors.invoiceId && (
              <span className="form-error">
                {form.formState.errors.invoiceId.message}
              </span>
            )}
          </label>
          {selected?.terms && (
            <div className="detail-row">
              <span>Exact full repayment required</span>
              <strong>{formatAmount(selected.terms.repayment)}</strong>
            </div>
          )}
          <label>
            Private collection evidence reference
            <input {...form.register("evidenceReference")} />
            {form.formState.errors.evidenceReference && (
              <span className="form-error">
                {form.formState.errors.evidenceReference.message}
              </span>
            )}
          </label>
          <Button
            type="submit"
            disabled={form.formState.isSubmitting || !eligible.length}
          >
            {form.formState.isSubmitting
              ? "Preparing…"
              : "Prepare reconciliation"}
          </Button>
        </form>
      </section>
      <section className="panel stack">
        <div className="panel-header">
          <h2>Reconciled payment records</h2>
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
        {reconciliations.data.items.map((record) => {
          const invoice = query.data.items.find(
            (row) => row.id === record.invoiceId,
          );
          return (
            <article
              className="stack"
              key={record.id}
              style={{
                borderBottom: "1px solid var(--border)",
                paddingBottom: 20,
              }}
            >
              <div className="row space-between">
                <div>
                  <h3>
                    {invoice?.invoiceNumber ?? record.invoiceId.slice(0, 8)}
                  </h3>
                  <p className="small">
                    Collection reference: {record.evidenceReference}
                  </p>
                </div>
                <StatusBadge status={record.status} />
              </div>
              <div className="detail-row">
                <span>Repayment amount</span>
                <strong>{formatAmount(record.amount)}</strong>
              </div>
              {record.status === "PREPARED" && invoice?.commitment && (
                <div className="row">
                  <ConfirmAction
                    label="Approve exact repayment"
                    title="Approve settlement spending"
                    description={`Allow the financing contract to receive exactly ${formatAmount(record.amount)} from your wallet. This does not deposit the repayment yet.`}
                    disabled={tx.busy}
                    onConfirm={() =>
                      tx.execute(
                        network.deployment.token,
                        encodeFunctionData({
                          abi: erc20Abi,
                          functionName: "approve",
                          args: [
                            network.deployment.financing,
                            BigInt(record.amount),
                          ],
                        }),
                        false,
                      )
                    }
                  />
                  <ConfirmAction
                    label="Deposit full repayment"
                    title="Deposit the reconciled repayment"
                    description={`Transfer ${formatAmount(record.amount)} to the settlement contract. The full obligation is accepted only once.`}
                    disabled={tx.busy}
                    onConfirm={() =>
                      tx.execute(
                        network.deployment.financing,
                        encodeFunctionData({
                          abi: financingAbi,
                          functionName: "depositRepayment",
                          args: [
                            invoice.commitment as Hash,
                            BigInt(record.amount),
                            record.evidenceCommitment as Hash,
                          ],
                        }),
                      )
                    }
                  />
                </div>
              )}
              {record.transactionHash && (
                <p className="small">
                  <TransactionLink
                    hash={record.transactionHash as Hash}
                    network={network}
                  />
                </p>
              )}
              {record.status === "DEPOSITED" &&
                invoice?.commitment &&
                invoice.financing?.state === 6 && (
                  <ConfirmAction
                    label="Pay agreed platform fee"
                    title="Pay the fixed platform fee"
                    description="The contract will pay exactly the approved fee to its fixed treasury. Investor principal cannot be withdrawn by this action."
                    disabled={tx.busy}
                    onConfirm={() =>
                      tx.execute(
                        network.deployment.financing,
                        encodeFunctionData({
                          abi: financingAbi,
                          functionName: "claimFee",
                          args: [invoice.commitment as Hash],
                        }),
                      )
                    }
                  />
                )}
              {invoice?.financing && (
                <div className="row">
                  <StatusBadge status={stateNames[invoice.financing.state]} />
                  <small className="muted">
                    Investor claims are reflected by canonical contract state.
                  </small>
                </div>
              )}
            </article>
          );
        })}
        {!reconciliations.data.items.length && (
          <EmptyState
            title="No reconciled repayments"
            description="Prepare a record after verifying the customer’s collection evidence."
          />
        )}
      </section>
      {(error || tx.error || query.error || reconciliations.error) && (
        <ErrorState
          message={
            error ||
            tx.error ||
            query.error?.message ||
            reconciliations.error?.message ||
            "Could not load settlements"
          }
        />
      )}
      {tx.phase && <p role="status">{tx.phase}</p>}
      {tx.hash && (
        <p>
          <TransactionLink hash={tx.hash} network={network} />
        </p>
      )}
    </div>
  );
}
