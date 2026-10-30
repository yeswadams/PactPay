"use client";
import { useQuery } from "@tanstack/react-query";
import { FileCheck2, ShieldCheck, Wallet } from "lucide-react";
import { type Hash } from "viem";
import { api } from "../wallet/api";
import { FundingPanel } from "../investments/funding-panel";
import { useNetwork } from "../wallet/providers";
import { TransactionLink } from "../wallet/transaction-link";
import { Metric } from "@/components/ui/page-header";
import { DateText } from "@/components/application/date-text";
import { ErrorState } from "@/components/ui/states";
import { formatAmount, formatKes } from "@/lib/domain";
import type { FinancingDetail } from "@/server/application/financing";
import type { OfferTerms } from "@pactpay/database";
export function OpportunityDetail({ initial }: { initial: FinancingDetail }) {
  const network = useNetwork();
  const query = useQuery({
    queryKey: ["opportunity", initial.id],
    queryFn: () => api<FinancingDetail>(`listings/${initial.id}`),
    initialData: initial,
    refetchInterval: 10000,
  });
  const data = query.data;
  const snapshot = data.snapshot as {
    terms: OfferTerms;
    funded: string;
    investors: string;
  };
  const terms = snapshot.terms;
  const discount =
    ((BigInt(data.faceValueCents) - BigInt(data.advanceCents)) * 10000n) /
    BigInt(data.faceValueCents);
  return (
    <div className="stack">
      {query.error && <ErrorState message={query.error.message} />}
      <div className="metrics">
        <Metric
          label="Invoice face value"
          value={formatKes(data.faceValueCents)}
          detail="Business-level invoice currency"
          icon={<FileCheck2 />}
        />
        <Metric
          label="Funding target"
          value={formatAmount(terms.target)}
          detail={`${formatAmount(snapshot.funded)} funded`}
          icon={<Wallet />}
        />
        <Metric
          label="Contractual investor pool"
          value={formatAmount(BigInt(terms.repayment) - BigInt(terms.fee))}
          detail="Payable only after full repayment"
          icon={<ShieldCheck />}
        />
        <Metric
          label="Requested KES discount"
          value={`${discount / 100n}.${(discount % 100n).toString().padStart(2, "0")}%`}
          detail="Face value versus requested KES advance"
        />
      </div>
      <div className="two-column">
        <div className="stack">
          <section className="panel stack">
            <div>
              <span className="eyebrow">{data.reference}</span>
              <h2 style={{ marginTop: 8 }}>{data.businessName}</h2>
              <p className="small" style={{ marginTop: 7 }}>
                This invoice passed human verification. Its customer identity
                and documents remain private.
              </p>
            </div>
            <dl className="definition-grid">
              <div className="detail-row">
                <span>Customer payment due</span>
                <strong>
                  <DateText value={data.dueDate} />
                </strong>
              </div>
              <div className="detail-row">
                <span>Funding closes</span>
                <strong>
                  <DateText
                    value={new Date(Number(terms.fundingDeadline) * 1000)}
                  />
                </strong>
              </div>
              <div className="detail-row">
                <span>Contract maturity</span>
                <strong>
                  <DateText value={new Date(Number(terms.maturity) * 1000)} />
                </strong>
              </div>
              <div className="detail-row">
                <span>Full contractual repayment</span>
                <strong>{formatAmount(terms.repayment)}</strong>
              </div>
              <div className="detail-row">
                <span>Fixed platform fee</span>
                <strong>{formatAmount(terms.fee)}</strong>
              </div>
              <div className="detail-row">
                <span>Participating wallets</span>
                <strong>{snapshot.investors}</strong>
              </div>
            </dl>
            <p className="info-note">
              Positions are non-transferable. Your entitlement is the investor
              pool multiplied by your contribution divided by the funding
              target, rounded down in token base units. Residual dust returns to
              the SME after all claims.
            </p>
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>Confirmed activity</h2>
              <small className="muted">Through block {data.blockNumber}</small>
            </div>
            <ol className="timeline">
              {data.events.map((event) => (
                <li key={event.id}>
                  <strong>
                    {event.name.replace(/([a-z])([A-Z])/g, "$1 $2")}
                  </strong>
                  <small>
                    Block {event.blockNumber}{" "}
                    {network && (
                      <>
                        {" "}
                        ·{" "}
                        <TransactionLink
                          hash={event.transactionHash as Hash}
                          network={network}
                        />
                      </>
                    )}
                  </small>
                </li>
              ))}
            </ol>
          </section>
          <section className="panel stack">
            <h2>Risk & contract information</h2>
            <p className="small">
              Repayment depends on customer performance, trusted verification
              and payment reconciliation. A blockchain record does not prove an
              invoice is genuine or legally enforceable. There is no default
              insurance, partial repayment model or guaranteed return.
            </p>
            <div className="detail-row">
              <span>Financing contract</span>
              <code>{network?.deployment.financing}</code>
            </div>
            <div className="detail-row">
              <span>Invoice commitment</span>
              <code>{data.commitment}</code>
            </div>
          </section>
        </div>
        <FundingPanel commitment={data.commitment} />
      </div>
    </div>
  );
}
