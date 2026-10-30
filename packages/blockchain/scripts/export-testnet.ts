import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createPublicClient, http, getAddress } from "viem";
import {
  deploymentSchema,
  validateNetwork,
  configuredChain,
} from "../src/config/index.ts";
if (
  !process.env.DEPLOY_CHAIN_ID ||
  !process.env.RPC_URL ||
  process.env.ALLOW_MOCK_DEPLOYMENT !== "true"
)
  throw new Error(
    "Set DEPLOY_CHAIN_ID, RPC_URL and ALLOW_MOCK_DEPLOYMENT=true",
  );
const chainId = Number(process.env.DEPLOY_CHAIN_ID);
const broadcast = JSON.parse(
  await readFile(
    new URL(
      `../../contracts/broadcast/Deploy.s.sol/${chainId}/run-latest.json`,
      import.meta.url,
    ),
    "utf8",
  ),
);
const financing = broadcast.transactions.find(
  (t: { contractName: string }) => t.contractName === "PactPayFinancing",
);
const token = broadcast.transactions.find(
  (t: { contractName: string }) => t.contractName === "MockSettlementToken",
);
if (
  !financing ||
  !token ||
  broadcast.receipts.some((r: { status: string }) => BigInt(r.status) !== 1n)
)
  throw new Error("Incomplete or reverted deployment");
const receipt = broadcast.receipts.find(
  (r: { transactionHash: string }) => r.transactionHash === financing.hash,
);
const manifest = deploymentSchema.parse({
  version: "1.0.0",
  network: process.env.NETWORK_NAME ?? `Testnet ${chainId}`,
  chainId,
  mock: true,
  testnet: true,
  financing: getAddress(financing.contractAddress),
  token: getAddress(token.contractAddress),
  tokenDecimals: 6,
  deploymentBlock: BigInt(receipt.blockNumber).toString(),
  transactions: broadcast.transactions.map((t: { hash: string }) => t.hash),
  abi: "PactPayFinancing/1.0.0",
});
const config = validateNetwork(
  manifest,
  chainId,
  process.env.RPC_URL,
  Number(process.env.BLOCK_CONFIRMATIONS ?? 3),
);
const client = createPublicClient({
  chain: configuredChain(config),
  transport: http(config.rpcUrl),
});
if ((await client.getChainId()) !== chainId)
  throw new Error("RPC chain mismatch");
for (const hash of manifest.transactions) {
  const deployed = await client.waitForTransactionReceipt({
    hash: hash as `0x${string}`,
    confirmations: config.confirmations,
  });
  if (deployed.status !== "success")
    throw new Error("Deployment transaction failed");
}
await mkdir(new URL("../deployments/", import.meta.url), { recursive: true });
await writeFile(
  new URL(`../deployments/${chainId}.json`, import.meta.url),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("Verified testnet deployment manifest exported");
