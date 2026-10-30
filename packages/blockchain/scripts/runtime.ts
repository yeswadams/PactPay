import { readFile } from "node:fs/promises";
import { validateNetwork } from "../src/config/index.ts";
export async function loadNetwork() {
  const chainId = Number(process.env.CHAIN_ID ?? "31337");
  const path =
    process.env.PACTPAY_DEPLOYMENT_FILE ??
    new URL(`../deployments/${chainId}.json`, import.meta.url);
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(
      `Deployment manifest missing: run pnpm web3:deploy for chain ${chainId}`,
    );
  }
  const result = validateNetwork(
    manifest,
    chainId,
    process.env.RPC_URL ?? "http://127.0.0.1:8545",
    Number(process.env.BLOCK_CONFIRMATIONS ?? "1"),
    process.env.PACTPAY_REAL_MONEY === "true",
  );
  if (process.env.EXPLORER_URL)
    result.explorerUrl = new URL(process.env.EXPLORER_URL).origin;
  return result;
}
