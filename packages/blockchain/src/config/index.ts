import { z } from "zod";
import { defineChain, getAddress, isAddress } from "viem";

const address = z
  .string()
  .refine(isAddress, "Invalid EVM address")
  .transform((value) => getAddress(value));
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const deploymentSchema = z.object({
  version: z.literal("1.0.0"),
  network: z.string().min(1),
  chainId: z.number().int().positive(),
  mock: z.literal(true),
  testnet: z.literal(true),
  financing: address,
  token: address,
  tokenDecimals: z.literal(6),
  deploymentBlock: z.string().regex(/^\d+$/),
  transactions: z.array(hash).min(2),
  abi: z.literal("PactPayFinancing/1.0.0"),
});
export type Deployment = z.infer<typeof deploymentSchema>;
export type NetworkConfig = {
  deployment: Deployment;
  rpcUrl: string;
  confirmations: number;
  explorerUrl?: string;
};
const testnets = new Set([
  31337, 11155111, 84532, 421614, 80002, 11155420, 97, 43113,
]);
export function validateNetwork(
  deployment: unknown,
  expectedChain: number,
  rpcUrl: string,
  confirmations = 1,
  production = false,
): NetworkConfig {
  const parsed = deploymentSchema.parse(deployment);
  if (parsed.chainId !== expectedChain)
    throw new Error(
      "Deployment manifest chain does not match configured chain",
    );
  if (production || !testnets.has(expectedChain))
    throw new Error(
      "Real-money/production chains are disabled in this mock-token MVP",
    );
  if (!Number.isInteger(confirmations) || confirmations < 1)
    throw new Error("At least one confirmation is required");
  new URL(rpcUrl);
  return { deployment: parsed, rpcUrl, confirmations };
}
export function configuredChain(config: NetworkConfig) {
  return defineChain({
    id: config.deployment.chainId,
    name: config.deployment.network,
    testnet: true,
    nativeCurrency: { name: "Test Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    ...(config.explorerUrl
      ? {
          blockExplorers: {
            default: { name: "Explorer", url: config.explorerUrl },
          },
        }
      : {}),
  });
}
export const stateNames = [
  "NONE",
  "APPROVED",
  "OPEN",
  "FUNDED",
  "DISBURSED",
  "OVERDUE",
  "REPAID",
  "SETTLED",
  "EXPIRED",
] as const;
