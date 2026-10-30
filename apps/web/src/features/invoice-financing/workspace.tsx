"use client";
import { useState, type FormEvent } from "react";
import {
  useConnect,
  useConnectors,
  useConnection,
  useDisconnect,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { useQuery } from "@tanstack/react-query";
import {
  erc20Abi,
  encodeFunctionData,
  formatUnits,
  parseUnits,
  keccak256,
  toHex,
  type Hash,
} from "viem";
import {
  financingAbi,
  stateNames,
  type NetworkConfig,
} from "@pactpay/blockchain";
import { api } from "../wallet/api";
import { WalletTransactionHistory } from "../wallet/transaction-history";
import { useTransaction } from "../wallet/use-transaction";
import { TransactionLink } from "../wallet/transaction-link";
import { OperatorPanel } from "./operators";

type ListingRecord = {
  id: string;
  commitment: Hash;
  state: number;
  blockNumber: string;
};
const shorten = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;
const units = (value: bigint) => formatUnits(value, 6);
export function FinancingWorkspace({ network }: { network: NetworkConfig }) {
  const [tab, setTab] = useState<"market" | "portfolio" | "operators">(
    "market",
  );
  const connect = useConnect();
  const connectors = useConnectors();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const connection = useConnection();
  const listings = useQuery({
    queryKey: ["listings"],
    queryFn: () => api<ListingRecord[]>("blockchain/listings"),
    refetchInterval: 10000,
  });
  const history = useQuery({
    queryKey: ["history", connection.address],
    queryFn: () =>
      api<{ hash: Hash; blockNumber: string; status: string }[]>(
        `blockchain/history?wallet=${connection.address}`,
      ),
    enabled: !!connection.address,
    refetchInterval: 10000,
  });
  const balance = useReadContract({
    address: network.deployment.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: connection.address ? [connection.address] : undefined,
    query: { enabled: !!connection.address, refetchInterval: 5000 },
  });
  const wrongChain =
    connection.isConnected && connection.chainId !== network.deployment.chainId;
  return (
    <>
      <section className="panel wallet">
        <div>
          <span className="eyebrow">
            {network.deployment.network} · chain {network.deployment.chainId}
          </span>
          <p>
            {connection.address ? (
              <>
                <code>{connection.address}</code>
                <br />
                Active chain: {connection.chainId} ·{" "}
                {balance.data !== undefined
                  ? `${units(balance.data)} MOCK available`
                  : "Loading balance…"}
              </>
            ) : (
              "Connect an injected wallet to fund an offer or claim your position."
            )}
          </p>
        </div>
        <div className="actions">
          {connection.isConnected ? (
            <button className="secondary" onClick={() => disconnect.mutate({})}>
              Disconnect
            </button>
          ) : (
            connectors.map((connector) => (
              <button
                key={connector.uid}
                disabled={connect.isPending}
                onClick={() => connect.mutate({ connector })}
              >
                Connect {connector.name}
              </button>
            ))
          )}
        </div>
        {(connect.error || switchChain.error) && (
          <p role="alert">{(connect.error ?? switchChain.error)?.message}</p>
        )}
        {wrongChain && (
          <div className="notice">
            <p>
              Unsupported wallet network. This workspace uses chain{" "}
              {network.deployment.chainId}.
            </p>
            <button
              onClick={() =>
                switchChain.mutate({ chainId: network.deployment.chainId })
              }
            >
              Switch network
            </button>
          </div>
        )}
      </section>
      <nav aria-label="Workspace">
        <button
          aria-pressed={tab === "market"}
          onClick={() => setTab("market")}
        >
          Financing marketplace
        </button>
        <button
          aria-pressed={tab === "portfolio"}
          onClick={() => setTab("portfolio")}
        >
          My investments
        </button>
        <button
          aria-pressed={tab === "operators"}
          onClick={() => setTab("operators")}
        >
          SME & operators
        </button>
      </nav>
      {tab === "operators" ? (
        <OperatorPanel network={network} />
      ) : (
        <>
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                {tab === "market"
                  ? "Verified protocol offers"
                  : "Your non-transferable positions"}
              </span>
              <h2>
                {tab === "market"
                  ? "Working capital, with clear terms."
                  : "Track contributions and claims."}
              </h2>
            </div>
            <button className="secondary" onClick={() => listings.refetch()}>
              Refresh
            </button>
          </div>
          {listings.isPending && (
            <p role="status">Loading finalized listings…</p>
          )}
          {listings.error && <p role="alert">{listings.error.message}</p>}
          {listings.data?.length === 0 && (
            <section className="panel">
              <p>
                No indexed offers yet. Submit and approve a sample invoice, then
                run the synchronization worker.
              </p>
            </section>
          )}
          {tab === "portfolio" && !connection.address && (
            <p>Connect a wallet to view your positions.</p>
          )}
          <div className="cards">
            {listings.data?.map((listing) => (
              <FinancingCard
                key={listing.id}
                listing={listing}
                network={network}
                portfolio={tab === "portfolio"}
                disabled={!!wrongChain}
              />
            ))}
          </div>
          {tab === "portfolio" && (
            <WalletTransactionHistory network={network} />
          )}
          {tab === "portfolio" && connection.address && (
            <section className="panel">
              <h2>Confirmed transaction history</h2>
              {history.error && <p role="alert">{history.error.message}</p>}
              {history.data?.length === 0 && (
                <p>No indexed protocol transactions for this address.</p>
              )}
              {history.data?.map((tx) => (
                <p key={tx.hash}>
                  <TransactionLink hash={tx.hash} network={network} /> · block{" "}
                  {tx.blockNumber} · {tx.status}
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}
function FinancingCard({
  listing,
  network,
  portfolio,
  disabled,
}: {
  listing: ListingRecord;
  network: NetworkConfig;
  portfolio: boolean;
  disabled: boolean;
}) {
  const { address } = useConnection();
  const [amount, setAmount] = useState("");
  const tx = useTransaction(network);
  const config = {
    address: network.deployment.financing,
    abi: financingAbi,
  } as const;
  const query = { refetchInterval: 5000 };
  const read = useReadContract({
    ...config,
    functionName: "getListing",
    args: [listing.commitment],
    query,
  });
  const status = useReadContract({
    ...config,
    functionName: "effectiveState",
    args: [listing.commitment],
    query,
  });
  const eligible = useReadContract({
    ...config,
    functionName: "hasRole",
    args: address ? [keccak256(toHex("INVESTOR_ROLE")), address] : undefined,
    query: { ...query, enabled: !!address },
  });
  const position = useReadContract({
    ...config,
    functionName: "positions",
    args: address ? [listing.commitment, address] : undefined,
    query: { ...query, enabled: !!address },
  });
  const claimable = useReadContract({
    ...config,
    functionName: "claimable",
    args: address ? [listing.commitment, address] : undefined,
    query: { ...query, enabled: !!address },
  });
  const allowance = useReadContract({
    address: network.deployment.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, network.deployment.financing] : undefined,
    query: { ...query, enabled: !!address },
  });
  if (portfolio && (!address || !position.data || position.data[0] === 0n))
    return null;
  if (read.error)
    return (
      <section className="panel">
        <p role="alert">
          Could not read {shorten(listing.commitment)}:{" "}
          {read.error.shortMessage}
        </p>
      </section>
    );
  if (!read.data)
    return (
      <section className="panel">
        <p>Reading {shorten(listing.commitment)}…</p>
      </section>
    );
  const data = read.data;
  const terms = data.terms;
  if (terms.token.toLowerCase() !== network.deployment.token.toLowerCase()) {
    return (
      <article className="panel">
        <h3>Different settlement asset</h3>
        <p>
          This offer uses a token outside this demo configuration. Select its
          matching deployment configuration before interacting.
        </p>
        <code>{listing.commitment}</code>
      </article>
    );
  }
  const state = status.data ?? data.state;
  let baseUnits = 0n;
  if (/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(amount)) {
    try {
      baseUnits = parseUnits(amount, 6);
    } catch {
      /* invalid amount remains zero */
    }
  }
  const remaining = terms.target - data.funded;
  const valid = baseUnits > 0n && baseUnits <= remaining;
  const canSpend = allowance.data !== undefined && allowance.data >= baseUnits;
  const progress = terms.target
    ? Number((data.funded * 10000n) / terms.target) / 100
    : 0;
  const preview = terms.target
    ? (baseUnits * (terms.repayment - terms.fee)) / terms.target
    : 0n;
  const claim = (functionName: "claim" | "refund") =>
    tx.execute(
      network.deployment.financing,
      encodeFunctionData({
        abi: financingAbi,
        functionName,
        args: [listing.commitment],
      }),
    );
  async function fund(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    if (!canSpend)
      await tx.execute(
        network.deployment.token,
        encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [network.deployment.financing, baseUnits],
        }),
        false,
      );
    else
      await tx.execute(
        network.deployment.financing,
        encodeFunctionData({
          abi: financingAbi,
          functionName: "contribute",
          args: [listing.commitment, baseUnits],
        }),
      );
  }
  return (
    <article className="panel offer">
      <div className="offer-top">
        <span className="eyebrow">
          Sample invoice · {shorten(listing.commitment)}
        </span>
        <span className="badge">{stateNames[state]}</span>
      </div>
      <h3>{units(terms.target)} MOCK advance</h3>
      <p>
        Verifier-approved terms · {units(terms.repayment - terms.fee)} MOCK
        contractual investor pool if repaid in full.
      </p>
      <dl>
        <div>
          <dt>Raised</dt>
          <dd>
            {units(data.funded)} / {units(terms.target)} MOCK
          </dd>
        </div>
        <div>
          <dt>Platform fee on repayment</dt>
          <dd>{units(terms.fee)} MOCK</dd>
        </div>
        <div>
          <dt>Funding closes</dt>
          <dd>
            {new Date(Number(terms.fundingDeadline) * 1000).toLocaleString()}
          </dd>
        </div>
        <div>
          <dt>Repayment maturity</dt>
          <dd>{new Date(Number(terms.maturity) * 1000).toLocaleString()}</dd>
        </div>
        <div>
          <dt>SME beneficiary</dt>
          <dd>
            <code title={terms.beneficiary}>{shorten(terms.beneficiary)}</code>
          </dd>
        </div>
        <div>
          <dt>Disbursement</dt>
          <dd>
            {[4, 5, 6, 7].includes(data.state)
              ? "Disbursed on-chain"
              : "Not disbursed"}
          </dd>
        </div>
      </dl>
      <progress max="100" value={progress} aria-label="Funding progress" />
      {address && position.data && (
        <p>
          Your contribution: {units(position.data[0])} MOCK · Claimable:{" "}
          {units(claimable.data ?? 0n)} MOCK
          {position.data[1] ? " · Refunded" : ""}
          {position.data[2] ? " · Claimed" : ""}
        </p>
      )}
      <p className="risk">
        Payment depends on the customer and trusted off-chain collection.
        Returns are contractual amounts, never guaranteed. MOCK has no monetary
        value.
      </p>
      {state === 2 && address && !eligible.data && (
        <p>
          New funding requires an administrator-approved demo investor wallet.
        </p>
      )}
      {state === 2 && (
        <form onSubmit={fund}>
          <label>
            Contribution (MOCK, up to 6 decimals)
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100.00"
            />
          </label>
          <p>
            Allowance: {units(allowance.data ?? 0n)} MOCK · Contractual
            repayment for this contribution: {units(preview)} MOCK
          </p>
          <button
            disabled={
              !address || !eligible.data || disabled || tx.busy || !valid
            }
          >
            {canSpend ? "Fund invoice" : "Approve exact amount"}
          </button>
        </form>
      )}
      {state === 8 &&
        position.data &&
        position.data[0] > 0n &&
        !position.data[1] && (
          <button
            disabled={disabled || tx.busy}
            onClick={() => claim("refund")}
          >
            Claim refund
          </button>
        )}
      {state === 6 &&
        position.data &&
        position.data[0] > 0n &&
        !position.data[2] && (
          <button disabled={disabled || tx.busy} onClick={() => claim("claim")}>
            Claim repayment
          </button>
        )}
      {tx.phase && <p role="status">{tx.phase}</p>}
      {tx.hash && (
        <p>
          <TransactionLink hash={tx.hash} network={network} />
        </p>
      )}
      {tx.error && <p role="alert">{tx.error}</p>}
      <small>
        Projection finalized through block {listing.blockNumber}. Live values
        read directly from the contract.
      </small>
    </article>
  );
}
