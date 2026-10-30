import assert from "node:assert/strict";
import {
  createTestClient,
  createWalletClient,
  http,
  encodeFunctionData,
  keccak256,
  toHex,
} from "viem";
import {
  connectDatabase,
  invoiceOnchainRecords,
  blockchainEvents,
  eq,
} from "@pactpay/database";
import { loadNetwork } from "./runtime.ts";
import { protocolClient } from "../src/clients/index.ts";
import { syncProtocol, deploymentId } from "../src/clients/sync.ts";
import { configuredChain } from "../src/config/index.ts";
import { financingAbi } from "../src/abi/index.ts";
const config = await loadNetwork();
if (config.deployment.chainId !== 31337)
  throw new Error("Reorg test is local only");
const client = protocolClient(config);
const chain = configuredChain(config);
const control = createTestClient({
  chain,
  mode: "anvil",
  transport: http(config.rpcUrl),
});
const wallet = createWalletClient({ chain, transport: http(config.rpcUrl) });
const [admin, verifier, , , , sme] = await wallet.getAddresses();
const { db, sql } = connectDatabase();
try {
  await syncProtocol(config, db);
  const snapshot = await control.snapshot();
  const now = (await client.getBlock()).timestamp;
  const id = keccak256(toHex(`reorg-${Date.now()}`));
  const hash = await wallet.sendTransaction({
    account: verifier,
    to: config.deployment.financing,
    data: encodeFunctionData({
      abi: financingAbi,
      functionName: "approveInvoice",
      args: [
        id,
        {
          token: config.deployment.token,
          beneficiary: sme,
          treasury: admin,
          target: 100n,
          repayment: 110n,
          fee: 1n,
          fundingDeadline: now + 86400n,
          maturity: now + 172800n,
        },
      ],
    }),
  });
  assert.equal(
    (await client.waitForTransactionReceipt({ hash })).status,
    "success",
  );
  await syncProtocol(config, db);
  const key = `${deploymentId(config)}:${id}`;
  assert.equal(
    (
      await db
        .select()
        .from(invoiceOnchainRecords)
        .where(eq(invoiceOnchainRecords.id, key))
    ).length,
    1,
  );
  await control.revert({ id: snapshot });
  await control.mine({ blocks: 1 });
  await syncProtocol(config, db);
  assert.equal(
    (
      await db
        .select()
        .from(invoiceOnchainRecords)
        .where(eq(invoiceOnchainRecords.id, key))
    ).length,
    0,
  );
  assert.equal(
    (
      await db
        .select()
        .from(blockchainEvents)
        .where(eq(blockchainEvents.transactionHash, hash))
    ).length,
    0,
  );
  console.log(
    "PASS: confirmed reorg removed orphaned events and rebuilt canonical projections",
  );
} finally {
  await sql.end();
}
