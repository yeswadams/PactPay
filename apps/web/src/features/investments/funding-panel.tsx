"use client";
import { useState } from "react";
import { useConnection, useReadContract } from "wagmi";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  erc20Abi,
  encodeFunctionData,
  keccak256,
  toHex,
  type Hash,
} from "viem";
import {
  financingAbi,
  stateNames,
  type NetworkConfig,
} from "@pactpay/blockchain";
import { useNetwork } from "../wallet/providers";
import { useTransaction } from "../wallet/use-transaction";
import { useSession } from "../auth/session";
import { TransactionLink } from "../wallet/transaction-link";
import { parseAmount, formatAmount } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, LoadingState, ErrorState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status";
const schema = z.object({
  amount: z
    .string()
    .regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/, "Use up to six decimal places")
    .refine((value) => {
      try {
        return BigInt(parseAmount(value, 6)) > 0n;
      } catch {
        return false;
      }
    }, "Enter a positive contribution"),
});
export function FundingPanel({ commitment }: { commitment: Hash }) {
  const network = useNetwork();
  return network ? (
    <ConnectedPanel network={network} commitment={commitment} />
  ) : (
    <ErrorState message="Contract configuration is unavailable." />
  );
}
function ConnectedPanel({
  network,
  commitment,
}: {
  network: NetworkConfig;
  commitment: Hash;
}) {
  const connection = useConnection();
  const auth = useSession();
  const tx = useTransaction(network);
  const [confirmation, setConfirmation] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { amount: "" },
  });
  const contract = {
    address: network.deployment.financing,
    abi: financingAbi,
    chainId: network.deployment.chainId,
  } as const;
  const query = { refetchInterval: 5000 };
  const listing = useReadContract({
    ...contract,
    functionName: "getListing",
    args: [commitment],
    query,
  });
  const effective = useReadContract({
    ...contract,
    functionName: "effectiveState",
    args: [commitment],
    query,
  });
  const position = useReadContract({
    ...contract,
    functionName: "positions",
    args: connection.address ? [commitment, connection.address] : undefined,
    query: { ...query, enabled: !!connection.address },
  });
  const claimable = useReadContract({
    ...contract,
    functionName: "claimable",
    args: connection.address ? [commitment, connection.address] : undefined,
    query: { ...query, enabled: !!connection.address },
  });
  const eligible = useReadContract({
    ...contract,
    functionName: "hasRole",
    args: connection.address
      ? [keccak256(toHex("INVESTOR_ROLE")), connection.address]
      : undefined,
    query: { ...query, enabled: !!connection.address },
  });
  const paused = useReadContract({
    ...contract,
    functionName: "paused",
    query,
  });
  const allowance = useReadContract({
    address: network.deployment.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: connection.address
      ? [connection.address, network.deployment.financing]
      : undefined,
    chainId: network.deployment.chainId,
    query: { ...query, enabled: !!connection.address },
  });
  const balance = useReadContract({
    address: network.deployment.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: connection.address ? [connection.address] : undefined,
    chainId: network.deployment.chainId,
    query: { ...query, enabled: !!connection.address },
  });
  const input = useWatch({ control: form.control, name: "amount" });
  let amount = 0n;
  try {
    amount = BigInt(parseAmount(input, 6));
  } catch {}
  if (listing.error)
    return (
      <ErrorState
        message="The financing contract could not be read. Check your network and try again."
        retry={() => listing.refetch()}
      />
    );
  if (!listing.data)
    return <LoadingState label="Reading the live financing position…" />;
  const data = listing.data;
  const state = effective.data ?? data.state;
  const correctToken =
    data.terms.token.toLowerCase() === network.deployment.token.toLowerCase();
  if (!correctToken)
    return (
      <ErrorState message="This offer uses another settlement asset. A matching token configuration is required." />
    );
  const remaining = data.terms.target - data.funded;
  const preview = data.terms.target
    ? (amount * (data.terms.repayment - data.terms.fee)) / data.terms.target
    : 0n;
  const canSpend = amount > 0n && (allowance.data ?? 0n) >= amount;
  const approved =
    eligible.data &&
    auth.data?.organization?.eligibilityStatus === "APPROVED" &&
    auth.data.organization.role === "investor";
  const wrongChain = connection.chainId !== network.deployment.chainId;
  async function request() {
    if (amount > remaining) {
      form.setError("amount", {
        message: "This contribution exceeds the remaining funding capacity",
      });
      return;
    }
    if (amount > (balance.data ?? 0n)) {
      form.setError("amount", {
        message: "Your settlement-token balance is too low",
      });
      return;
    }
    setConfirmation(true);
  }
  async function fund() {
    setConfirmation(false);
    if (canSpend)
      await tx.execute(
        network.deployment.financing,
        encodeFunctionData({
          abi: financingAbi,
          functionName: "contribute",
          args: [commitment, amount],
        }),
      );
    else
      await tx.execute(
        network.deployment.token,
        encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [network.deployment.financing, amount],
        }),
        false,
      );
  }
  return (
    <section className="panel stack">
      <div className="panel-header">
        <div>
          <h2>Your participation</h2>
          <p>Live contract values</p>
        </div>
        <StatusBadge status={stateNames[state]} />
      </div>
      <div>
        <div className="detail-row">
          <span>Your contribution</span>
          <strong>{formatAmount(position.data?.[0] ?? 0n)}</strong>
        </div>
        <div className="detail-row">
          <span>Claimable repayment</span>
          <strong>{formatAmount(claimable.data ?? 0n)}</strong>
        </div>
        <div className="detail-row">
          <span>Token balance</span>
          <strong>{formatAmount(balance.data ?? 0n)}</strong>
        </div>
      </div>
      {wrongChain && (
        <p className="notice">
          Switch to {network.deployment.network} using the wallet controls
          before transacting.
        </p>
      )}
      {state === 2 && (
        <>
          {!approved && (
            <p className="notice">
              Funding requires approved investor eligibility and an authorized
              investor wallet. Verification is separate from signing in.
            </p>
          )}
          {paused.data && (
            <p className="notice">
              New funding is paused by the protocol. Existing refund and
              repayment claims remain available.
            </p>
          )}
          <form className="stack" onSubmit={form.handleSubmit(request)}>
            <label>
              Contribution (MOCK)
              <input
                inputMode="decimal"
                placeholder="100.00"
                {...form.register("amount")}
              />
              {form.formState.errors.amount && (
                <span role="alert" className="form-error">
                  {form.formState.errors.amount.message}
                </span>
              )}
            </label>
            <div className="detail-row">
              <span>Remaining funding capacity</span>
              <strong>{formatAmount(remaining)}</strong>
            </div>
            <div className="detail-row">
              <span>Spending allowance</span>
              <strong>{formatAmount(allowance.data ?? 0n)}</strong>
            </div>
            <div className="detail-row">
              <span>Contractual repayment if paid in full</span>
              <strong>{formatAmount(preview)}</strong>
            </div>
            <Button
              type="submit"
              disabled={!approved || wrongChain || tx.busy || !!paused.data}
            >
              {canSpend ? "Fund this invoice" : "Approve exact amount"}
            </Button>
            <p className="small">
              A token approval permits the contract to spend this amount.
              Funding is a separate transaction.
            </p>
          </form>
        </>
      )}
      {state === 8 &&
        position.data &&
        position.data[0] > 0n &&
        !position.data[1] && (
          <ConfirmAction
            label="Claim refund"
            title="Recover your contribution"
            description={`${formatAmount(position.data[0])} will be returned to your connected wallet. A network fee applies.`}
            disabled={wrongChain || tx.busy}
            onConfirm={() =>
              tx.execute(
                network.deployment.financing,
                encodeFunctionData({
                  abi: financingAbi,
                  functionName: "refund",
                  args: [commitment],
                }),
              )
            }
          />
        )}
      {state === 6 &&
        position.data &&
        position.data[0] > 0n &&
        !position.data[2] && (
          <ConfirmAction
            label="Claim repayment"
            title="Claim your repayment"
            description={`${formatAmount(claimable.data ?? 0n)} is available for your connected wallet. A network fee applies.`}
            disabled={wrongChain || tx.busy}
            onConfirm={() =>
              tx.execute(
                network.deployment.financing,
                encodeFunctionData({
                  abi: financingAbi,
                  functionName: "claim",
                  args: [commitment],
                }),
              )
            }
          />
        )}
      {position.data?.[1] && (
        <p className="info-note">Your contribution was refunded.</p>
      )}
      {position.data?.[2] && (
        <p className="info-note">You have claimed this position’s repayment.</p>
      )}
      {tx.phase && (
        <p role="status" className="small">
          {tx.phase}
        </p>
      )}
      {tx.hash && (
        <p className="small">
          <TransactionLink hash={tx.hash} network={network} />
        </p>
      )}
      {tx.error && <ErrorState message={tx.error} />}
      <p className="notice">
        Payment depends on the customer and off-chain collection. Contractual
        returns are not guaranteed. MOCK tokens have no monetary value.
      </p>
      <Dialog open={confirmation} onOpenChange={setConfirmation}>
        <DialogContent
          title={
            canSpend ? "Confirm invoice funding" : "Approve token spending"
          }
          description={
            canSpend
              ? `Contribute ${formatAmount(amount)} to this invoice. Your position is non-transferable and repayment carries risk.`
              : `Allow this financing contract to spend exactly ${formatAmount(amount)}. This approval does not fund the invoice yet.`
          }
        >
          <div className="detail-row">
            <span>Financing contract</span>
            <code>{network.deployment.financing}</code>
          </div>
          <p className="notice">
            Review the wallet’s transaction and network fee before confirming.
          </p>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setConfirmation(false)}>
              Cancel
            </Button>
            <Button onClick={fund}>Continue to wallet</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
