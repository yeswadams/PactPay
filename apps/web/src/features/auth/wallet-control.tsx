"use client";
import { useState, useSyncExternalStore } from "react";
import {
  useConnect,
  useConnectors,
  useConnection,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
  useReadContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { erc20Abi, BaseError } from "viem";
import { Wallet, LogOut, ShieldCheck, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { useNetwork } from "../wallet/providers";
import { api } from "../wallet/api";
import { useSession } from "./session";
import { formatAmount, shortAddress } from "@/lib/domain";
const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
export function WalletControl({ expanded = false }: { expanded?: boolean }) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    clientSnapshot,
    serverSnapshot,
  );
  const connect = useConnect();
  const connectors = useConnectors();
  const connection = useConnection();
  const disconnect = useDisconnect();
  const signer = useSignMessage();
  const switchChain = useSwitchChain();
  const network = useNetwork();
  const session = useSession();
  const queries = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const balance = useReadContract({
    address: network?.deployment.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: connection.address ? [connection.address] : undefined,
    query: {
      enabled: !!network && !!connection.address,
      refetchInterval: 10000,
    },
  });
  const wrongChain =
    !!network &&
    connection.isConnected &&
    connection.chainId !== network.deployment.chainId;
  const signedIn =
    !!session.data &&
    !!connection.address &&
    session.data.user.walletAddress.toLowerCase() ===
      connection.address.toLowerCase();
  async function attempt(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (cause) {
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
  async function signIn() {
    if (!connection.address || !network) return;
    const challenge = await api<{ message: string }>("auth/challenge", {
      method: "POST",
      body: JSON.stringify({
        address: connection.address,
        chainId: network.deployment.chainId,
      }),
    });
    const signature = await signer.mutateAsync({ message: challenge.message });
    await api("auth/verify", {
      method: "POST",
      body: JSON.stringify({ message: challenge.message, signature }),
    });
    await queries.invalidateQueries({ queryKey: ["session"] });
    setOpen(false);
    router.push("/app");
    router.refresh();
  }
  const contents = (
    <div className="wallet-controls">
      {!network && (
        <p role="alert">
          The protocol configuration is unavailable. Ask your operator to check
          deployment settings.
        </p>
      )}
      {connection.isConnected ? (
        <>
          <div className="connected-wallet">
            <Wallet size={22} />
            <div>
              <strong>{shortAddress(connection.address)}</strong>
              <small>
                {network?.deployment.network ?? "Network unavailable"} · chain{" "}
                {connection.chainId}
              </small>
            </div>
          </div>
          <div className="detail-row">
            <span>Settlement balance</span>
            <strong>{formatAmount(balance.data ?? 0n)}</strong>
          </div>
          {wrongChain ? (
            <Button
              disabled={busy}
              onClick={() =>
                attempt(async () => {
                  await switchChain.mutateAsync({
                    chainId: network!.deployment.chainId,
                  });
                })
              }
            >
              Switch to supported network
            </Button>
          ) : signedIn ? (
            <div className="signed-in">
              <ShieldCheck size={16} /> Wallet authenticated
            </div>
          ) : (
            <Button disabled={busy || !network} onClick={() => attempt(signIn)}>
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <ShieldCheck size={16} />
              )}{" "}
              Sign in securely
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              attempt(async () => {
                await api("auth/logout", { method: "POST", body: "{}" });
                disconnect.mutate({});
                queries.clear();
                setOpen(false);
                router.push("/login");
                router.refresh();
              })
            }
          >
            <LogOut size={16} /> Disconnect & sign out
          </Button>
        </>
      ) : (
        <>
          {connectors.map((connector) => (
            <Button
              key={connector.uid}
              disabled={busy || !network}
              onClick={() =>
                attempt(async () => {
                  await connect.mutateAsync({ connector });
                })
              }
            >
              <Wallet size={16} /> Connect{" "}
              {connector.name === "Injected" ? "wallet" : connector.name}
            </Button>
          ))}
          <p className="muted small">
            Use an EVM wallet such as MetaMask or Rabby. Connecting is followed
            by a sign-in message; this does not approve spending.
          </p>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
  if (!hydrated)
    return <p className="muted small" role="status">Loading wallet…</p>;
  if (expanded) return contents;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={signedIn ? "secondary" : "default"}>
          <Wallet size={16} />
          {connection.address
            ? shortAddress(connection.address)
            : "Connect wallet"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={signedIn ? "Your wallet" : "Connect and sign in"}
        description="Your wallet proves ownership of your account. Keep private keys and recovery phrases in your wallet."
      >
        {contents}
      </DialogContent>
    </Dialog>
  );
}
