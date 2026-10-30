"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, Plus } from "lucide-react";
import { api } from "../wallet/api";
import { Filters, Pagination } from "@/components/application/filters";
import { DateText } from "@/components/application/date-text";
import { StatusBadge } from "@/components/ui/status";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatKes, formatAmount } from "@/lib/domain";
import { stateNames } from "@pactpay/blockchain";
import type { InvoicePage } from "@/server/application/invoices";
export function InvoiceList({
  initial,
  mode = "invoices",
  operator = false,
}: {
  initial: InvoicePage;
  mode?: "invoices" | "funding" | "repayments";
  operator?: boolean;
}) {
  const search = useSearchParams();
  const query = useQuery({
    queryKey: [operator ? "operator-invoices" : "invoices", search.toString()],
    queryFn: () =>
      api<InvoicePage>(`${operator ? "admin/invoices" : "invoices"}?${search}`),
    initialData: initial,
    refetchInterval: 15000,
  });
  const data = query.data;
  return (
    <div className="stack">
      <Filters
        statuses={[
          { value: "draft", label: "Draft" },
          { value: "submitted", label: "In review" },
          { value: "needs_information", label: "Information needed" },
          { value: "confirmed", label: "Verified" },
          { value: "rejected", label: "Rejected" },
        ]}
        placeholder={
          operator ? "Search invoice or business…" : "Search invoice reference…"
        }
      />
      {query.error && (
        <ErrorState
          message={query.error.message}
          retry={() => query.refetch()}
        />
      )}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>
              {operator
                ? "Business invoices"
                : mode === "funding"
                  ? "Funding requests"
                  : mode === "repayments"
                    ? "Repayment tracking"
                    : "Your invoices"}
            </h2>
            <p>
              {operator
                ? "Human verification is separate from on-chain financing."
                : "Your organization’s records only."}
            </p>
          </div>
          {!operator && mode === "invoices" && (
            <Button asChild size="sm">
              <Link href="/app/invoices/new">
                <Plus size={13} />
                Submit invoice
              </Link>
            </Button>
          )}
        </div>
        {data.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice reference</th>
                  {operator && <th>Business</th>}
                  <th>Face value</th>
                  <th>Requested advance</th>
                  <th>Payment due</th>
                  <th>
                    {mode === "invoices" ? "Verification" : "Financing state"}
                  </th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link href={`/app/invoices/${invoice.id}`}>
                        {invoice.invoiceNumber}
                      </Link>
                      <small>
                        {invoice.commitment
                          ? `PP-${invoice.id.slice(0, 8).toUpperCase()}`
                          : "Draft"}
                      </small>
                    </td>
                    {operator && <td>{invoice.businessName}</td>}
                    <td>{formatKes(invoice.faceValueCents)}</td>
                    <td>{formatKes(invoice.advanceCents)}</td>
                    <td>
                      <DateText value={invoice.dueDate} />
                    </td>
                    <td>
                      <StatusBadge
                        status={
                          mode === "invoices"
                            ? invoice.status
                            : invoice.financing
                              ? stateNames[invoice.financing.state]
                              : "NONE"
                        }
                      />
                    </td>
                    <td>
                      <Button asChild size="icon" variant="ghost">
                        <Link
                          href={`/app/invoices/${invoice.id}`}
                          aria-label={`Open invoice ${invoice.invoiceNumber}`}
                        >
                          <ArrowUpRight size={15} />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              operator ? "No invoices match this view" : "No invoices found"
            }
            description={
              operator
                ? "Submitted invoices will appear after an SME uploads evidence and sends them for review."
                : "Submit your first invoice, or adjust the current filters."
            }
          />
        )}
      </section>
      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
      />
      {mode !== "invoices" && (
        <aside className="notice">
          Funding and repayment statuses come from finalized contract events.
          Recording a customer payment reference alone does not mark repayment
          complete.
        </aside>
      )}
    </div>
  );
}
