"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { type Hash } from "viem";
import { api } from "../wallet/api";
import { FundingPanel } from "./funding-panel";
import { WalletTransactionHistory } from "../wallet/transaction-history";
import { useNetwork } from "../wallet/providers";
import { Metric } from "@/components/ui/page-header";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/application/filters";
import { formatAmount } from "@/lib/domain";
import type { PortfolioPage } from "@/server/application/financing";
export function Portfolio({ initial }: { initial: PortfolioPage }) {
  const search = useSearchParams();
  const network = useNetwork();
  const query = useQuery({
    queryKey: ["portfolio", search.toString()],
    queryFn: () => api<PortfolioPage>(`investments?${search}`),
    initialData: initial,
    refetchInterval: 10000,
  });
  const data = query.data;
  return (
    <div className="stack">
      <div className="metrics">
        <Metric
          label="Total contributions"
          value={formatAmount(data.totals.contributed)}
          detail="Cumulative accepted contributions"
        />
        <Metric
          label="Claimable repayments"
          value={formatAmount(data.totals.claimable)}
          detail="Ready for a repayment claim"
        />
        <Metric
          label="Refundable principal"
          value={formatAmount(data.totals.refundable)}
          detail="Expired unsuccessful or undisbursed offers"
        />
        <Metric
          label="Realized distributions"
          value={formatAmount(data.totals.distributed)}
          detail="Confirmed on-chain repayment claims"
        />
      </div>
      {query.error && <ErrorState message={query.error.message} />}
      <div className="market-grid">
        {data.items.map((row) => (
          <article className="stack" key={row.position.id}>
            {row.invoiceId && (
              <Link
                className="eyebrow"
                href={`/app/marketplace/${row.invoiceId}`}
              >
                Review PP-{row.invoiceId.slice(0, 8).toUpperCase()}
              </Link>
            )}
            <FundingPanel commitment={row.record.commitment as Hash} />
          </article>
        ))}
      </div>
      {!data.items.length && (
        <section className="panel">
          <EmptyState
            title="No investment positions yet"
            description="Your confirmed contributions and available claims will appear here."
            action={
              <Button asChild>
                <Link href="/app/marketplace">
                  Browse verified opportunities
                </Link>
              </Button>
            }
          />
        </section>
      )}
      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
      />
      {network && <WalletTransactionHistory network={network} />}
    </div>
  );
}
