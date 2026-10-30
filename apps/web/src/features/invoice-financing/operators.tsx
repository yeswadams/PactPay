"use client";
import { useState, type FormEvent } from "react";
import {
  encodeFunctionData,
  parseUnits,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { financingAbi, type NetworkConfig } from "@pactpay/blockchain";
import { api } from "../wallet/api";
import { useTransaction } from "../wallet/use-transaction";
import { TransactionLink } from "../wallet/transaction-link";

type Invoice = {
  id: string;
  canonicalReference: string;
  status: string;
  commitment: Hash;
  faceValueKesMinor: string;
  documentReference: string;
  terms?: { repayment: string };
};
type Prepared = { to: Address; data: Hex };
type Reconciliation = {
  id: string;
  invoiceId: string;
  evidenceCommitment: Hash;
  amount: string;
  status: string;
};
function tokenUnits(value: FormDataEntryValue | null) {
  const amount = String(value ?? "");
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(amount))
    throw new Error("Use a non-negative MOCK amount with at most six decimals");
  return parseUnits(amount, 6).toString();
}
export function OperatorPanel({ network }: { network: NetworkConfig }) {
  const [role, setRole] = useState("sme");
  const [credential, setCredential] = useState("");
  const [rows, setRows] = useState<Invoice[]>([]);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [events, setEvents] = useState<
    { id: string; name: string; blockNumber: string; transactionHash: Hash }[]
  >([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const tx = useTransaction(network);
  const headers = { Authorization: `Bearer ${credential}` };
  async function run(action: () => Promise<void>) {
    setMessage("");
    setPending(true);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operation failed");
    } finally {
      setPending(false);
    }
  }
  async function load() {
    const data = await api<(Invoice | { invoice: Invoice })[]>("invoices", {
      headers,
    });
    setRows(data.map((row) => ("invoice" in row ? row.invoice : row)));
    if (role === "settler")
      setReconciliations(
        await api<Reconciliation[]>("settlements", { headers }),
      );
  }
  async function prepare(id: string, action: string) {
    const prepared = await api<Prepared>(`invoices/${id}/${action}`, {
      method: "POST",
      headers,
      body: "{}",
    });
    await tx.execute(prepared.to, prepared.data);
  }
  function submit(
    event: FormEvent<HTMLFormElement>,
    action: (data: FormData) => Promise<void>,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(() => action(data));
  }
  return (
    <section className="panel operators">
      <span className="eyebrow">Private demo workspace</span>
      <h2>Invoice verification & settlement</h2>
      <p>
        Use sample references only. Role credentials remain in this screen’s
        memory. The connected wallet must separately hold the required contract
        role.
      </p>
      <div className="form-grid">
        <label>
          Workspace role
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setCredential("");
              setRows([]);
              setEvents([]);
              setReconciliations([]);
            }}
          >
            <option value="sme">SME</option>
            <option value="verifier">Verifier</option>
            <option value="lister">Listing operator</option>
            <option value="settler">Repayment operator</option>
            <option value="sync">Sync operator</option>
          </select>
        </label>
        <label>
          Role credential
          <input
            type="password"
            autoComplete="off"
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
          />
        </label>
      </div>
      {role !== "sync" && (
        <button disabled={pending || !credential} onClick={() => run(load)}>
          Load authorized invoices
        </button>
      )}
      {role === "sme" && (
        <form
          onSubmit={(event) =>
            submit(event, async (data) => {
              const invoice = await api<Invoice>("invoices", {
                method: "POST",
                headers,
                body: JSON.stringify({
                  canonicalReference: data.get("reference"),
                  faceValueKesMinor: data.get("kes"),
                  documentReference: data.get("document"),
                }),
              });
              setMessage(`Submitted sample invoice ${invoice.id}`);
              await load();
            })
          }
        >
          <h3>Submit a sample invoice</h3>
          <label>
            Canonical issuer / invoice reference
            <input
              name="reference"
              required
              placeholder="demo-supplier/invoice-001"
            />
          </label>
          <label>
            Face value in KES minor units (100 = KES 1)
            <input
              name="kes"
              required
              inputMode="numeric"
              placeholder="50000000"
            />
          </label>
          <label>
            Private evidence reference
            <input
              name="document"
              required
              placeholder="private-demo-record-001"
            />
          </label>
          <button disabled={pending || !credential}>
            Submit for verification
          </button>
        </form>
      )}
      {role === "verifier" && (
        <form
          onSubmit={(event) =>
            submit(event, async (data) => {
              const decision = String(data.get("decision"));
              const terms =
                decision === "APPROVED"
                  ? {
                      token: network.deployment.token,
                      beneficiary: data.get("beneficiary"),
                      treasury: data.get("treasury"),
                      target: tokenUnits(data.get("target")),
                      repayment: tokenUnits(data.get("repayment")),
                      fee: tokenUnits(data.get("fee")),
                      fundingDeadline: Math.floor(
                        new Date(String(data.get("deadline"))).getTime() / 1000,
                      ).toString(),
                      maturity: Math.floor(
                        new Date(String(data.get("maturity"))).getTime() / 1000,
                      ).toString(),
                    }
                  : undefined;
              await api(`invoices/${data.get("id")}/verify`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                  decision,
                  evidenceReference: data.get("evidence"),
                  terms,
                }),
              });
              setMessage(
                "Off-chain verification recorded. Approve exact terms on-chain below.",
              );
              await load();
            })
          }
        >
          <h3>Record human verification</h3>
          <label>
            Invoice record ID
            <input name="id" required />
          </label>
          <label>
            Decision
            <select name="decision">
              <option>APPROVED</option>
              <option>REJECTED</option>
            </select>
          </label>
          <label>
            Supporting private evidence reference
            <input name="evidence" required />
          </label>
          <div className="form-grid">
            <label>
              SME beneficiary address
              <input name="beneficiary" />
            </label>
            <label>
              Platform treasury address
              <input name="treasury" />
            </label>
            <label>
              Funding target (MOCK)
              <input name="target" defaultValue="450" />
            </label>
            <label>
              Full repayment (MOCK)
              <input name="repayment" defaultValue="500" />
            </label>
            <label>
              Platform fee (MOCK)
              <input name="fee" defaultValue="5" />
            </label>
            <label>
              Funding deadline
              <input name="deadline" type="datetime-local" />
            </label>
            <label>
              Repayment maturity
              <input name="maturity" type="datetime-local" />
            </label>
          </div>
          <p>
            KES invoice values are separate from MOCK terms. No exchange rate is
            implied.
          </p>
          <button disabled={pending || !credential}>Record verification</button>
        </form>
      )}
      {role === "settler" && (
        <form
          onSubmit={(event) =>
            submit(event, async (data) => {
              const prepared = await api<Prepared>("settlements", {
                method: "POST",
                headers,
                body: JSON.stringify({
                  invoiceId: data.get("id"),
                  evidenceReference: data.get("evidence"),
                  amount: tokenUnits(data.get("repayment")),
                }),
              });
              await load();
              await tx.execute(prepared.to, prepared.data);
            })
          }
        >
          <h3>Reconcile full customer repayment</h3>
          <p>
            Record verified collection evidence, approve the mock token spending
            in your wallet, then sign the deposit.
          </p>
          <label>
            Invoice record ID
            <input name="id" required />
          </label>
          <label>
            Private collection evidence reference
            <input name="evidence" required minLength={8} />
          </label>
          <label>
            Exact full repayment (MOCK)
            <input name="repayment" required defaultValue="500" />
          </label>
          <button disabled={pending || !credential}>
            Prepare and deposit repayment
          </button>
        </form>
      )}
      <div className="private-records">
        {rows.map((invoice) => (
          <article key={invoice.id}>
            <h3>
              {invoice.canonicalReference} · {invoice.status}
            </h3>
            <p>
              Record ID: <code>{invoice.id}</code>
            </p>
            <p>
              KES minor units: {invoice.faceValueKesMinor} · Private evidence:{" "}
              {invoice.documentReference}
            </p>
            <p>
              On-chain commitment: <code>{invoice.commitment}</code>
            </p>
            <div className="actions">
              {role === "verifier" && invoice.status === "APPROVED" && (
                <button
                  disabled={tx.busy || pending}
                  onClick={() => run(() => prepare(invoice.id, "approval"))}
                >
                  Sign on-chain approval
                </button>
              )}
              {role === "lister" && invoice.status === "APPROVED" && (
                <>
                  <button
                    disabled={tx.busy || pending}
                    onClick={() => run(() => prepare(invoice.id, "listing"))}
                  >
                    Open approved offer
                  </button>
                  <button
                    disabled={tx.busy || pending}
                    onClick={() =>
                      run(() => prepare(invoice.id, "disbursement"))
                    }
                  >
                    Disburse fully funded offer
                  </button>
                </>
              )}
              {role === "settler" && invoice.terms && (
                <>
                  <button
                    disabled={tx.busy}
                    onClick={() =>
                      tx.execute(
                        network.deployment.token,
                        encodeFunctionData({
                          abi: [
                            {
                              type: "function",
                              name: "approve",
                              stateMutability: "nonpayable",
                              inputs: [
                                { name: "spender", type: "address" },
                                { name: "amount", type: "uint256" },
                              ],
                              outputs: [{ type: "bool" }],
                            },
                          ] as const,
                          functionName: "approve",
                          args: [
                            network.deployment.financing,
                            BigInt(invoice.terms!.repayment),
                          ],
                        }),
                        false,
                      )
                    }
                  >
                    Approve exact repayment spending
                  </button>
                  <button
                    disabled={tx.busy}
                    onClick={() =>
                      tx.execute(
                        network.deployment.financing,
                        encodeFunctionData({
                          abi: financingAbi,
                          functionName: "claimFee",
                          args: [invoice.commitment],
                        }),
                      )
                    }
                  >
                    Pay agreed platform fee
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {role === "settler" &&
        reconciliations.map((record) => {
          const invoice = rows.find((row) => row.id === record.invoiceId);
          return (
            <article key={record.id}>
              <p>
                Reconciliation {record.id} · {record.status}
              </p>
              {record.status === "PREPARED" && invoice && (
                <button
                  disabled={tx.busy}
                  onClick={() =>
                    tx.execute(
                      network.deployment.financing,
                      encodeFunctionData({
                        abi: financingAbi,
                        functionName: "depositRepayment",
                        args: [
                          invoice.commitment,
                          BigInt(record.amount),
                          record.evidenceCommitment,
                        ],
                      }),
                    )
                  }
                >
                  Retry prepared repayment
                </button>
              )}
            </article>
          );
        })}
      {role === "sync" && (
        <button
          disabled={pending || !credential}
          onClick={() =>
            run(async () => {
              const result = await api<{ finalizedBlock: string }>(
                "blockchain/sync",
                { method: "POST", headers, body: "{}" },
              );
              setMessage(
                `Projection finalized through block ${result.finalizedBlock}`,
              );
            })
          }
        >
          Synchronize confirmed events
        </button>
      )}
      {role !== "sme" && (
        <button
          className="secondary"
          disabled={pending || !credential}
          onClick={() =>
            run(async () => {
              setEvents(await api("blockchain/events", { headers }));
            })
          }
        >
          Inspect protocol events
        </button>
      )}
      {events.map((event) => (
        <p key={event.id}>
          {event.name} · block {event.blockNumber} ·{" "}
          <TransactionLink hash={event.transactionHash} network={network} />
        </p>
      ))}
      {message && <p role="status">{message}</p>}
      {tx.phase && <p role="status">{tx.phase}</p>}
      {tx.hash && (
        <p>
          <TransactionLink hash={tx.hash} network={network} />
        </p>
      )}
      {tx.error && <p role="alert">{tx.error}</p>}
    </section>
  );
}
