"use client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { api } from "../wallet/api";
import { Pagination } from "@/components/application/filters";
import { DateText } from "@/components/application/date-text";
import { EmptyState, ErrorState } from "@/components/ui/states";
export type AuditPage = {
  items: {
    id: string;
    actor: string;
    action: string;
    subject: string;
    createdAt: string | Date;
    details: unknown;
  }[];
  total: number;
  page: number;
  pageSize: number;
};
export function AuditLog({ initial }: { initial: AuditPage }) {
  const search = useSearchParams();
  const query = useQuery({
    queryKey: ["audit", search.toString()],
    queryFn: () => api<AuditPage>(`admin/audit?${search}`),
    initialData: initial,
    refetchInterval: 15000,
  });
  return (
    <div className="stack">
      {query.error && <ErrorState message={query.error.message} />}
      <section className="panel">
        <div className="panel-header">
          <h2>Append-only operations history</h2>
          <small className="muted">
            No document contents or credentials are logged
          </small>
        </div>
        {query.data.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target resource</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.action.replaceAll("_", " ").toLowerCase()}</td>
                    <td>
                      <code title={row.actor}>{row.actor.slice(0, 16)}</code>
                    </td>
                    <td>
                      <code title={row.subject}>
                        {row.subject.slice(0, 20)}
                      </code>
                    </td>
                    <td>
                      <DateText value={row.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState description="Sensitive operator actions will appear here." />
        )}
      </section>
      <Pagination {...query.data} />
    </div>
  );
}
