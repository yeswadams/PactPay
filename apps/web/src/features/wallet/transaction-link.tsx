import type { Hash } from "viem";
import type { NetworkConfig } from "@pactpay/blockchain";
const shorten = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;
export function TransactionLink({
  hash,
  network,
}: {
  hash: Hash;
  network: NetworkConfig;
}) {
  return network.explorerUrl ? (
    <a
      href={`${network.explorerUrl}/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
    >
      {shorten(hash)} ↗
    </a>
  ) : (
    <code title={hash}>{shorten(hash)}</code>
  );
}
