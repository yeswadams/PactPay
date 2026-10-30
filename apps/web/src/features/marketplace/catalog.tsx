"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Building2, ArrowUpRight } from "lucide-react";
import { api } from "../wallet/api";
import { Filters, Pagination } from "@/components/application/filters";
import { DateText } from "@/components/application/date-text";
import { StatusBadge } from "@/components/ui/status";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { formatAmount, formatKes } from "@/lib/domain";
import { stateNames } from "@pactpay/blockchain";
import type { MarketplacePage } from "@/server/application/financing";
export function Marketplace({ initial }: { initial: MarketplacePage }) {
  const search = useSearchParams();
  const query = useQuery({
    queryKey: ["marketplace", search.toString()],
    queryFn: () => api<MarketplacePage>(`listings?${search}`),
    initialData: initial,
    refetchInterval: 15000,
  });
  const data = query.data;
  return (
    <div className="stack">
      <aside className="notice">
        Review the verified terms and repayment risks before investing. KES
        invoice values and MOCK settlement amounts are separate currencies; no
        exchange rate is implied.
      </aside>
      <Filters
        sorting
        statuses={[
          { value: "2", label: "Open for funding" },
          { value: "3", label: "Fully funded" },
          { value: "4", label: "Disbursed" },
          { value: "5", label: "Overdue" },
          { value: "6", label: "Repaid" },
          { value: "7", label: "Settled" },
        ]}
        placeholder="Search financing reference or disclosed business…"
      />
      {query.error && (
        <ErrorState
          message={query.error.message}
          retry={() => query.refetch()}
        />
      )}
      <div className="market-grid">
        {data.items.map((offer) => {
          const terms = offer.snapshot.terms;
          const funded = BigInt(offer.snapshot.funded);
          const target = BigInt(terms.target);
          const percent = target ? Number((funded * 10000n) / target) / 100 : 0;
          return (
            <article className="panel listing-card" key={offer.id}>
              <div className="row space-between">
                <span className="eyebrow">{offer.reference}</span>
                <StatusBadge status={stateNames[offer.state]} />
              </div>
              <div className="listing-company">
                <span className="company-icon">
                  <Building2 size={18} />
                </span>
                <div>
                  <h3>{offer.businessName}</h3>
                  <small>Invoice verified by a human reviewer</small>
                </div>
              </div>
              <div className="listing-value">
                <small>Financing target</small>
                {formatAmount(terms.target)}
              </div>
              <div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={`Funding for ${offer.reference}`}
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${Math.min(percent, 100)}%` }} />
                </div>
                <div className="progress-caption">
                  <span>{formatAmount(funded)} funded</span>
                  <span>{percent}%</span>
                </div>
              </div>
              <div>
                <div className="detail-row">
                  <span>Invoice face value</span>
                  <strong>{formatKes(offer.faceValueCents)}</strong>
                </div>
                <div className="detail-row">
                  <span>Investor repayment pool</span>
                  <strong>
                    {formatAmount(BigInt(terms.repayment) - BigInt(terms.fee))}
                  </strong>
                </div>
                <div className="detail-row">
                  <span>Customer payment due</span>
                  <strong>
                    <DateText value={offer.dueDate} />
                  </strong>
                </div>
              </div>
              <Button asChild variant="secondary">
                <Link href={`/app/marketplace/${offer.id}`}>
                  Review opportunity <ArrowUpRight size={14} />
                </Link>
              </Button>
            </article>
          );
        })}
      </div>
      {!data.items.length && (
        <section className="panel">
          <EmptyState
            title="No opportunities match your filters"
            description="Approved on-chain offers will appear here after verification, listing and synchronization."
          />
        </section>
      )}
      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
      />
    </div>
  );
}
