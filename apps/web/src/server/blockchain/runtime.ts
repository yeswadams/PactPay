import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { connectDatabase } from "@pactpay/database";
import { protocolClient, validateNetwork } from "@pactpay/blockchain";

let connection: ReturnType<typeof connectDatabase> | undefined;
export function database() {
  return (connection ??= connectDatabase()).db;
}
export async function network() {
  const chainId = Number(process.env.CHAIN_ID ?? "31337");
  const root = process.cwd().endsWith("/apps/web")
    ? resolve(process.cwd(), "../..")
    : process.cwd();
  const path =
    process.env.PACTPAY_DEPLOYMENT_FILE ??
    resolve(root, `packages/blockchain/deployments/${chainId}.json`);
  // A generated release manifest is a runtime asset; never trace the whole repository.
  let deployment: unknown;
  try {
    deployment = JSON.parse(
      await readFile(/* turbopackIgnore: true */ path, "utf8"),
    );
  } catch {
    throw new Error(
      `Missing deployment manifest for chain ${chainId}; run pnpm web3:deploy`,
    );
  }
  const config = validateNetwork(
    deployment,
    chainId,
    process.env.RPC_URL ?? "http://127.0.0.1:8545",
    Number(process.env.BLOCK_CONFIRMATIONS ?? "1"),
    process.env.PACTPAY_REAL_MONEY === "true",
  );
  if (process.env.EXPLORER_URL)
    config.explorerUrl = new URL(process.env.EXPLORER_URL).origin;
  return { config, client: protocolClient(config) };
}
