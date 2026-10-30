"use client";
import { useState } from "react";
import { useConnection, usePublicClient, useSendTransaction } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { BaseError, type Address, type Hash, type Hex } from "viem";
import type { NetworkConfig } from "@pactpay/blockchain";
import { api } from "./api";
import { rememberTransaction } from "./transaction-history";

export function useTransaction(network: NetworkConfig) {
  const { address, chainId } = useConnection();
  const client = usePublicClient();
  const send = useSendTransaction();
  const queries = useQueryClient();
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState<Hash>();
  const [busy, setBusy] = useState(false);
  async function execute(to: Address, data: Hex, index = true) {
    setError("");
    setHash(undefined);
    if (!address || !client) {
      setError("Connect a wallet first");
      return;
    }
    if (chainId !== network.deployment.chainId) {
      setError("Switch to the configured network first");
      return;
    }
    setBusy(true);
    setPhase("Checking transaction…");
    try {
      await client.call({ account: address, to, data });
      setPhase("Confirm in your wallet");
      const tx = await send.mutateAsync({
        to,
        data,
        value: 0n,
        chainId: network.deployment.chainId,
      });
      setHash(tx);
      rememberTransaction(network.deployment.chainId, address, tx, index);
      void queries.invalidateQueries({
        queryKey: ["wallet-transactions", network.deployment.chainId, address],
      });
      setPhase("Submitted · waiting for confirmation");
      const receipt = await client.waitForTransactionReceipt({
        hash: tx,
        confirmations: network.confirmations,
        timeout: 120_000,
      });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      setPhase("Confirmed on-chain");
      if (index) {
        try {
          await api("investments", {
            method: "POST",
            body: JSON.stringify({ hash: tx, wallet: address }),
          });
        } catch {
          setPhase("Confirmed on-chain · history update pending");
        }
      }
      await queries.invalidateQueries();
    } catch (cause) {
      setPhase("Transaction incomplete");
      setError(
        cause instanceof BaseError
          ? cause.shortMessage
          : cause instanceof Error
            ? cause.message
            : "Wallet request failed",
      );
    } finally {
      setBusy(false);
    }
  }
  return { execute, busy, phase, error, hash };
}
