import Link from "next/link";
import {
  FileText,
  Clock3,
  HandCoins,
  CheckCheck,
  ArrowUpRight,
  Plus,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import { Metric } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { DateText } from "@/components/application/date-text";
import { formatKes, formatAmount } from "@/lib/domain";
import type { DashboardData } from "@/server/application/dashboard";
export function Overview({ data }: { data: DashboardData }) {
  if (data.kind === "investor")
    return (
      <div className="stack">
        <div className="metrics">
          <Metric
            label="Total contributions"
            value={formatAmount(data.portfolio.totals.contributed)}
            detail="Accepted on-chain contributions"
            icon={<HandCoins />}
          />
          <Metric
            label="Active positions"
            value={data.portfolio.totals.active.toString()}
            detail="Funding or awaiting repayment"
            icon={<FileText />}
          />
          <Metric
            label="Claimable repayment"
            value={formatAmount(data.portfolio.totals.claimable)}
            detail="Available after full repayment"
            icon={<Wallet />}
          />
          <Metric
            label="Realized distributions"
            value={formatAmount(data.portfolio.totals.distributed)}
            detail="Confirmed repayment claims"
            icon={<CheckCheck />}
          />
        </div>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Your portfolio</h2>
              <p>
                Expected contractual returns and realized distributions are
                separate.
              </p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link href="/app/investments">
                View all <ArrowUpRight size={13} />
              </Link>
            </Button>
          </div>
          {data.portfolio.items.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Financing reference</th>
                    <th>Your contribution</th>
                    <th>Claimable</th>
                    <th>Claim status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.portfolio.items.map((row) => (
                    <tr key={row.position.id}>
                      <td>
                        {row.invoiceId ? (
                          <Link href={`/app/marketplace/${row.invoiceId}`}>
                            PP-{row.invoiceId.slice(0, 8).toUpperCase()}
                          </Link>
                        ) : (
                          row.record.commitment.slice(0, 12)
                        )}
                      </td>
                      <td>{formatAmount(row.position.contribution)}</td>
                      <td>{formatAmount(row.position.claimable)}</td>
                      <td>
                        <StatusBadge
                          status={
                            row.position.claimed
                              ? "SETTLED"
                              : row.position.refunded
                                ? "EXPIRED"
                                : "OPEN"
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Your first investment starts here"
              description="Review verified financing opportunities and their contractual terms before contributing."
              action={
                <Button asChild>
                  <Link href="/app/marketplace">Explore marketplace</Link>
                </Button>
              }
            />
          )}
        </section>
        <aside className="notice">
          Repayment depends on customer payment and trusted collection.
          Contractual returns are not guaranteed. MOCK tokens have no monetary
          value.
        </aside>
      </div>
    );
  if (data.kind === "operator")
    return (
      <div className="stack">
        <div className="metrics">
          <Metric
            label="Awaiting verification"
            value={data.pending.toString()}
            detail="Submitted business invoices"
            icon={<ShieldCheck />}
          />
          <Metric
            label="Prepared settlements"
            value={data.prepared.toString()}
            detail="Require on-chain token deposits"
            icon={<Wallet />}
          />
        </div>
        <section className="panel">
          <div className="panel-header">
            <h2>Recent platform activity</h2>
          </div>
          {data.activity.length ? (
            <ol className="timeline">
              {data.activity.map((row) => (
                <li key={row.id}>
                  <strong>
                    {row.action.replaceAll("_", " ").toLowerCase()}
                  </strong>
                  <p className="small">Resource {row.subject.slice(0, 20)}</p>
                  <small>
                    <DateText value={row.createdAt} />
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState description="Authorized operator activity will appear here." />
          )}
        </section>
      </div>
    );
  return (
    <div className="stack">
      <div className="metrics">
        <Metric
          label="Total invoice value"
          value={formatKes(data.faceValue)}
          detail={`${data.submitted} saved invoices`}
          icon={<FileText />}
        />
        <Metric
          label="Pending verification"
          value={data.pending.toString()}
          detail="Waiting for a human reviewer"
          icon={<Clock3 />}
        />
        <Metric
          label="Approved requests"
          value={data.approved.toString()}
          detail={`${data.activeFunding} offers open or fully funded`}
          icon={<ShieldCheck />}
        />
        <Metric
          label="Financing received"
          value={formatAmount(data.received)}
          detail="Confirmed SME disbursements"
          icon={<HandCoins />}
        />
      </div>
      <div className="two-column">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Recent invoices</h2>
              <p>Track each invoice from submission to financing.</p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link href="/app/invoices">
                View all <ArrowUpRight size={13} />
              </Link>
            </Button>
          </div>
          {data.invoices.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Face value</th>
                    <th>Due date</th>
                    <th>Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <Link href={`/app/invoices/${invoice.id}`}>
                          {invoice.invoiceNumber}
                        </Link>
                      </td>
                      <td>{formatKes(invoice.faceValueCents)}</td>
                      <td>
                        <DateText value={invoice.dueDate} />
                      </td>
                      <td>
                        <StatusBadge status={invoice.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No invoices yet"
              description="Submit an invoice and supporting documents to request financing."
              action={
                <Button asChild>
                  <Link href="/app/invoices/new">
                    <Plus size={15} />
                    Submit invoice
                  </Link>
                </Button>
              }
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Upcoming repayments</h2>
            <Clock3 size={17} />
          </div>
          {data.upcoming.length ? (
            data.upcoming.map((row) => (
              <div className="list-item" key={row.id}>
                <div>
                  <Link href={`/app/invoices/${row.id}`}>
                    {row.invoiceNumber}
                  </Link>
                  <small>Customer payment due</small>
                </div>
                <DateText value={row.dueDate} />
              </div>
            ))
          ) : (
            <EmptyState
              title="No repayments due"
              description="Disbursed financing and customer due dates will appear here."
            />
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-header">
          <h2>Recent activity</h2>
        </div>
        {data.activity.length ? (
          <ol className="timeline">
            {data.activity.map((event) => (
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
            Your invoice and verification activity will appear here.
          </p>
        )}
      </section>
    </div>
  );
}
