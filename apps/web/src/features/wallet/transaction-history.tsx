"use client";
import { useQuery } from "@tanstack/react-query";
import { useConnection, usePublicClient } from "wagmi";
import { TransactionReceiptNotFoundError, type Address, type Hash } from "viem";
import type { NetworkConfig } from "@pactpay/blockchain";
import { TransactionLink } from "./transaction-link";
type Tracked = { hash: Hash; kind: "Protocol action" | "Token approval" };
const key = (chainId: number, address: Address) =>
  `pactpay:transactions:${chainId}:${address.toLowerCase()}`;
function read(chainId: number, address: Address): Tracked[] {
  try {
    const rows: unknown = JSON.parse(
      localStorage.getItem(key(chainId, address)) ?? "[]",
    );
    return Array.isArray(rows)
      ? rows
          .filter(
            (row): row is Tracked =>
              typeof row === "object" &&
              row !== null &&
              /^0x[0-9a-fA-F]{64}$/.test(row.hash) &&
              ["Protocol action", "Token approval"].includes(row.kind),
          )
          .slice(-50)
      : [];
  } catch {
    return [];
  }
}
export function rememberTransaction(
  chainId: number,
  address: Address,
  hash: Hash,
  protocol: boolean,
) {
  try {
    const rows = read(chainId, address).filter((row) => row.hash !== hash);
    localStorage.setItem(
      key(chainId, address),
      JSON.stringify(
        [
          ...rows,
          { hash, kind: protocol ? "Protocol action" : "Token approval" },
        ].slice(-50),
      ),
    );
  } catch {
    /* Storage restrictions do not prevent on-chain transaction handling. */
  }
}
export function WalletTransactionHistory({
  network,
}: {
  network: NetworkConfig;
}) {
  const { address } = useConnection();
  const client = usePublicClient();
  const history = useQuery({
    queryKey: ["wallet-transactions", network.deployment.chainId, address],
    enabled: !!address && !!client,
    refetchInterval: 5000,
    queryFn: async () => {
      if (!address || !client) return [];
      const tip = await client.getBlockNumber({ cacheTime: 0 });
      return Promise.all(
        read(network.deployment.chainId, address).map(async (row) => {
          try {
            const receipt = await client.getTransactionReceipt({
              hash: row.hash,
            });
            const canonical = await client.getBlock({
              blockNumber: receipt.blockNumber,
            });
            const status =
              canonical.hash !== receipt.blockHash
                ? "Orphaned"
                : tip - receipt.blockNumber + 1n < BigInt(network.confirmations)
                  ? "Confirming"
                  : receipt.status === "success"
                    ? "Confirmed"
                    : "Reverted";
            return { ...row, status };
          } catch (error) {
            if (error instanceof TransactionReceiptNotFoundError)
              return { ...row, status: "Submitted · receipt pending" };
            throw error;
          }
        }),
      );
    },
  });
  if (!address) return null;
  return (
    <section className="panel">
      <h2>Wallet submissions</h2>
      <p>
        Submitted hashes are checked against receipts. Only canonical protocol
        events update your financing positions.
      </p>
      {history.error && (
        <p role="alert">Could not check wallet receipts. Try refreshing.</p>
      )}
      {history.data?.length === 0 && (
        <p>
          No transactions submitted from this browser for this wallet and chain.
        </p>
      )}
      {history.data?.map((row) => (
        <p key={row.hash}>
          {row.kind} · <TransactionLink hash={row.hash} network={network} /> ·{" "}
          {row.status}
        </p>
      ))}
    </section>
  );
}
