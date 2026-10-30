"use client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { type Hash } from "viem";
import { api } from "../wallet/api";
import { useNetwork } from "../wallet/providers";
import { WalletTransactionHistory } from "../wallet/transaction-history";
import { TransactionLink } from "../wallet/transaction-link";
import { StatusBadge } from "@/components/ui/status";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Pagination } from "@/components/application/filters";
export type TransactionPage = {
  items: {
    id: string;
    hash: string;
    blockNumber: string;
    status: string;
    sender: string | null;
  }[];
  page: number;
  pageSize: number;
  total: number;
};
export function Transactions({ initial }: { initial: TransactionPage }) {
  const search = useSearchParams();
  const network = useNetwork();
  const query = useQuery({
    queryKey: ["transactions", search.toString()],
    queryFn: () => api<TransactionPage>(`transactions?${search}`),
    initialData: initial,
    refetchInterval: 10000,
  });
  return (
    <div className="stack">
      {network && <WalletTransactionHistory network={network} />}
      <section className="panel">
        <div className="panel-header">
          <h2>Canonical protocol history</h2>
          <small className="muted">Verified by the backend</small>
        </div>
        {query.error && <ErrorState message={query.error.message} />}
        {query.data.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Block</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {network ? (
                        <TransactionLink
                          hash={row.hash as Hash}
                          network={network}
                        />
                      ) : (
                        row.hash
                      )}
                    </td>
                    <td>{row.blockNumber}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No confirmed protocol transactions"
            description="Confirmed contributions, refunds, repayments and claims from your wallet will appear here after synchronization."
          />
        )}
      </section>
      <Pagination {...query.data} />
    </div>
  );
}
