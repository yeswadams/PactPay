"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../wallet/api";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status";
import { ErrorState } from "@/components/ui/states";
type Row = {
  id: string;
  name: string;
  wallet: string | null;
  organizationName: string;
  status: string;
};
export function EligibilityQueue() {
  const query = useQuery({
    queryKey: ["eligibility"],
    queryFn: () => api<Row[]>("admin/eligibility"),
  });
  const queries = useQueryClient();
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState("APPROVED");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel stack">
      <h2>Investor eligibility review</h2>
      <p className="small">
        Record a real review before approving an investor. The protocol
        administrator must separately authorize the wallet’s contract role.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Profile</th>
              <th>Organization</th>
              <th>Eligibility</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.name}
                  <small>{row.wallet?.slice(0, 14)}</small>
                </td>
                <td>{row.organizationName}</td>
                <td>
                  <StatusBadge status={row.status} />
                </td>
                <td>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSelected(row.id);
                      setReason("");
                    }}
                  >
                    Review
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            setBusy(true);
            try {
              await api("admin/eligibility", {
                method: "POST",
                body: JSON.stringify({
                  membershipId: selected,
                  status: decision,
                  reason,
                }),
              });
              await queries.invalidateQueries();
              setSelected("");
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not save review",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <label>
              Decision
              <select
                value={decision}
                onChange={(event) => setDecision(event.target.value)}
              >
                <option value="APPROVED">Approve eligibility</option>
                <option value="REJECTED">Reject eligibility</option>
              </select>
            </label>
            <label>
              Review reason
              <input
                minLength={10}
                maxLength={500}
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </div>
          <Button type="submit" disabled={busy}>
            Record eligibility decision
          </Button>
        </form>
      )}
      {(error || query.error) && (
        <ErrorState
          message={error || query.error?.message || "Could not load profiles"}
        />
      )}
    </section>
  );
}
