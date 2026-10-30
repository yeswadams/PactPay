"use client";
import { createContext, useContext, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors";
import { anvil } from "viem/chains";
import { configuredChain, type NetworkConfig } from "@pactpay/blockchain";
const NetworkContext = createContext<NetworkConfig | null>(null);
export const useNetwork = () => useContext(NetworkContext);
export function ApplicationProviders({
  network,
  children,
}: {
  network: NetworkConfig | null;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: true },
        },
      }),
  );
  const [config] = useState(() => {
    const chain = network ? configuredChain(network) : anvil;
    return createConfig({
      chains: [chain],
      connectors: [injected()],
      transports: {
        [chain.id]: http(network?.rpcUrl ?? "http://127.0.0.1:8545"),
      },
      ssr: true,
    });
  });
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <NetworkContext.Provider value={network}>
          {children}
        </NetworkContext.Provider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
