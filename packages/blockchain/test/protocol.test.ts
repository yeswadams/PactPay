import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeAbiParameters,
  encodeEventTopics,
  type PublicClient,
} from "viem";
import { deploymentSchema, validateNetwork } from "../src/config/index.ts";
import { financingAbi } from "../src/abi/index.ts";
import { verifyProtocolTransaction } from "../src/clients/index.ts";
const protocol = "0x1111111111111111111111111111111111111111";
const investor = "0x2222222222222222222222222222222222222222";
const token = "0x3333333333333333333333333333333333333333";
const hash = `0x${"a".repeat(64)}` as const;
const blockHash = `0x${"b".repeat(64)}` as const;
const manifest = {
  version: "1.0.0",
  network: "Anvil",
  chainId: 31337,
  mock: true,
  testnet: true,
  financing: protocol,
  token,
  tokenDecimals: 6,
  deploymentBlock: "1",
  transactions: [hash, hash],
  abi: "PactPayFinancing/1.0.0",
};
const config = validateNetwork(manifest, 31337, "http://localhost:8545", 3);
const receipt = {
  status: "success",
  to: protocol,
  from: investor,
  blockNumber: 10n,
  blockHash,
  logs: [
    {
      address: protocol,
      data: encodeAbiParameters([{ type: "uint256" }], [10n]),
      topics: encodeEventTopics({
        abi: financingAbi,
        eventName: "Contributed",
        args: { invoiceId: hash, investor },
      }),
      logIndex: 0,
    },
  ],
};
function client(overrides: Record<string, unknown> = {}) {
  return {
    getChainId: async () => 31337,
    getCode: async () => "0x01",
    readContract: async ({ functionName }: { functionName: string }) =>
      functionName === "VERSION" ? "1.0.0" : 6,
    getTransactionReceipt: async () => receipt,
    getBlockNumber: async () => 12n,
    getBlock: async () => ({ hash: blockHash }),
    ...overrides,
  } as unknown as PublicClient;
}
test("valid receipt requires matching canonical contract event and finality", async () => {
  const verified = await verifyProtocolTransaction(
    client(),
    config,
    hash,
    investor,
  );
  assert.equal(verified.events[0].eventName, "Contributed");
});
for (const [name, override] of Object.entries({
  "wrong chain": { getChainId: async () => 1 },
  "undeployed contract": { getCode: async () => "0x" },
  "reverted receipt": {
    getTransactionReceipt: async () => ({ ...receipt, status: "reverted" }),
  },
  "wrong destination": {
    getTransactionReceipt: async () => ({ ...receipt, to: token }),
  },
  "insufficient finality": { getBlockNumber: async () => 11n },
  "orphaned receipt": { getBlock: async () => ({ hash }) },
  "foreign logs": {
    getTransactionReceipt: async () => ({
      ...receipt,
      logs: receipt.logs.map((log) => ({ ...log, address: token })),
    }),
  },
}))
  test(`rejects ${name}`, async () => {
    await assert.rejects(
      verifyProtocolTransaction(client(override), config, hash, investor),
    );
  });
test("rejects a submitted transaction from a different wallet", async () => {
  await assert.rejects(
    verifyProtocolTransaction(client(), config, hash, token),
  );
});
test("configuration fails closed", () => {
  assert.throws(() => deploymentSchema.parse({}));
  assert.throws(() => validateNetwork(manifest, 84532, "http://localhost"));
  assert.throws(() =>
    validateNetwork({ ...manifest, chainId: 1 }, 1, "http://localhost"),
  );
  assert.throws(() => validateNetwork(manifest, 31337, "http://localhost", 0));
  assert.throws(() =>
    validateNetwork(manifest, 31337, "http://localhost", 1, true),
  );
  assert.throws(() =>
    validateNetwork(
      { ...manifest, tokenDecimals: 18 },
      31337,
      "http://localhost",
    ),
  );
});
