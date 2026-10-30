"use client";
import { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors";
import { configuredChain, type NetworkConfig } from "@pactpay/blockchain";
import { api } from "./api";
import { FinancingWorkspace } from "../invoice-financing/workspace";

function Connected({ network }: { network: NetworkConfig }) {
  const [config] = useState(() =>
    createConfig({
      chains: [configuredChain(network)],
      connectors: [injected()],
      transports: { [network.deployment.chainId]: http(network.rpcUrl) },
      ssr: true,
    }),
  );
  return (
    <WagmiProvider config={config}>
      <FinancingWorkspace network={network} />
    </WagmiProvider>
  );
}
function Bootstrap() {
  const config = useQuery({
    queryKey: ["network"],
    queryFn: () => api<NetworkConfig>("blockchain/config"),
    retry: false,
  });
  if (config.isPending) return <p role="status">Checking deployment…</p>;
  if (config.error)
    return (
      <section className="panel">
        <h2>Local protocol setup required</h2>
        <p>{config.error.message}</p>
        <p>
          Start Anvil and PostgreSQL, run <code>pnpm db:migrate</code>,{" "}
          <code>pnpm web3:deploy</code> and <code>pnpm web3:demo</code>.
        </p>
        <button onClick={() => config.refetch()}>Check again</button>
      </section>
    );
  return <Connected network={config.data} />;
}
export function Web3App() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <Bootstrap />
    </QueryClientProvider>
  );
}
