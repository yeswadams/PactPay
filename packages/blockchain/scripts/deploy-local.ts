import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
} from "viem";
import { anvil } from "viem/chains";
import { financingAbi } from "../src/abi/index.ts";
import { deploymentSchema } from "../src/config/index.ts";

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const client = createPublicClient({ chain: anvil, transport: http(rpcUrl) });
if ((await client.getChainId()) !== 31337)
  throw new Error("Local deployment only supports chain 31337");
const wallet = createWalletClient({ chain: anvil, transport: http(rpcUrl) });
const accounts = await wallet.getAddresses();
if (accounts.length < 9)
  throw new Error(
    "Run a fresh Anvil with at least nine unlocked demo accounts",
  );
const [admin, verifier, lister, settler, pauser] = accounts;
const transactions = [];
async function deploy(name: string) {
  const artifact = JSON.parse(
    await readFile(
      new URL(`../../contracts/out/${name}.sol/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
  const hash = await wallet.deployContract({
    account: admin,
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [admin],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress || receipt.status !== "success")
    throw new Error(`${name} deployment failed`);
  transactions.push(hash);
  return { address: receipt.contractAddress, block: receipt.blockNumber };
}
const financing = await deploy("PactPayFinancing");
const token = await deploy("MockSettlementToken");
for (const [role, recipient] of [
  ["VERIFIER_ROLE", verifier],
  ["LISTER_ROLE", lister],
  ["SETTLER_ROLE", settler],
  ["PAUSER_ROLE", pauser],
] as const) {
  const hash = await wallet.writeContract({
    account: admin,
    address: financing.address,
    abi: financingAbi,
    functionName: "grantRole",
    args: [keccak256(toHex(role)), recipient],
  });
  if ((await client.waitForTransactionReceipt({ hash })).status !== "success")
    throw new Error("Role initialization reverted");
  transactions.push(hash);
}
for (const recipient of accounts.slice(6, 9)) {
  const hash = await wallet.writeContract({
    account: admin,
    address: financing.address,
    abi: financingAbi,
    functionName: "grantRole",
    args: [keccak256(toHex("INVESTOR_ROLE")), recipient],
  });
  if ((await client.waitForTransactionReceipt({ hash })).status !== "success")
    throw new Error("Investor eligibility initialization reverted");
  transactions.push(hash);
}
const hash = await wallet.writeContract({
  account: admin,
  address: financing.address,
  abi: financingAbi,
  functionName: "configureToken",
  args: [token.address, true],
});
if ((await client.waitForTransactionReceipt({ hash })).status !== "success")
  throw new Error("Token initialization reverted");
transactions.push(hash);
const manifest = deploymentSchema.parse({
  version: "1.0.0",
  network: "Anvil local demo",
  chainId: 31337,
  mock: true,
  testnet: true,
  financing: financing.address,
  token: token.address,
  tokenDecimals: 6,
  deploymentBlock: financing.block.toString(),
  transactions,
  abi: "PactPayFinancing/1.0.0",
});
await mkdir(new URL("../deployments/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../deployments/31337.json", import.meta.url),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  "Local deployment exported:",
  manifest.financing,
  "mock token:",
  manifest.token,
);
