import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createWalletClient,
  http,
  encodeFunctionData,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import {
  connectDatabase,
  invoiceOnchainRecords,
  investorPositions,
  blockchainEvents,
  settlementReconciliations,
  eq,
  and,
} from "@pactpay/database";
import { financingAbi, mockTokenAbi } from "../src/abi/index.ts";
import { configuredChain } from "../src/config/index.ts";
import {
  protocolClient,
  verifyProtocolTransaction,
} from "../src/clients/index.ts";
import { syncProtocol, deploymentId } from "../src/clients/sync.ts";
import { loadNetwork } from "./runtime.ts";

const config = await loadNetwork();
if (config.deployment.chainId !== 31337)
  throw new Error("Demo may run only on local Anvil");
const client = protocolClient(config);
const wallet = createWalletClient({
  chain: configuredChain(config),
  transport: http(config.rpcUrl),
});
const [admin, verifier, lister, settler, , sme, ...investors] =
  await wallet.getAddresses();
if (investors.length < 3)
  throw new Error("Nine unlocked Anvil accounts required");
const treasury = admin;
const protocol = config.deployment.financing;
const token = config.deployment.token;
const web = process.env.DEMO_WEB_URL ?? "http://127.0.0.1:3000";
const { db, sql } = connectDatabase();
async function api<T>(path: string, role: string, body?: unknown): Promise<T> {
  const response = await fetch(`${web}/api/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env[`${role}_API_TOKEN`] ?? ""}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  assert.ok(response.ok, `${path}: ${JSON.stringify(result)}`);
  return result as T;
}
const hashes: Hash[] = [];
async function send(account: Address, to: Address, data: Hex) {
  const hash = await wallet.sendTransaction({ account, to, data, value: 0n });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  hashes.push(hash);
  return hash;
}
type Prepared = { to: Address; data: Hex };
type Invoice = { id: string; commitment: Hash };
try {
  const response = await fetch(`${web}/api/v1/invoices`);
  assert.equal(
    response.status,
    401,
    "Private invoices must reject anonymous reads",
  );
  const invoice = await api<Invoice>("invoices", "SME", {
    canonicalReference: `demo-supplier/${randomUUID()}`,
    faceValueKesMinor: "50000000",
    documentReference: "private-sample-invoice-evidence",
  });
  const now = (await client.getBlock()).timestamp;
  const terms = {
    token,
    beneficiary: sme,
    treasury,
    target: "450000000",
    repayment: "500000000",
    fee: "5000000",
    fundingDeadline: (now + 86400n).toString(),
    maturity: (now + 60n * 86400n).toString(),
  };
  await api(`invoices/${invoice.id}/verify`, "VERIFIER", {
    decision: "APPROVED",
    evidenceReference: "sample-human-buyer-confirmation",
    terms,
  });
  let prepared = await api<Prepared>(
    `invoices/${invoice.id}/approval`,
    "VERIFIER",
    {},
  );
  await send(verifier, prepared.to, prepared.data);
  prepared = await api<Prepared>(
    `invoices/${invoice.id}/listing`,
    "LISTER",
    {},
  );
  await send(lister, prepared.to, prepared.data);
  await syncProtocol(config, db);
  const initialSme = await client.readContract({
    address: token,
    abi: mockTokenAbi,
    functionName: "balanceOf",
    args: [sme],
  });
  const initialTreasury = await client.readContract({
    address: token,
    abi: mockTokenAbi,
    functionName: "balanceOf",
    args: [treasury],
  });
  const amounts = [200000000n, 150000000n, 100000000n];
  for (let i = 0; i < 3; i++) {
    const investor = investors[i];
    const amount = amounts[i];
    await send(
      admin,
      token,
      encodeFunctionData({
        abi: mockTokenAbi,
        functionName: "mint",
        args: [investor, amount],
      }),
    );
    await send(
      investor,
      token,
      encodeFunctionData({
        abi: mockTokenAbi,
        functionName: "approve",
        args: [protocol, amount],
      }),
    );
    const hash = await send(
      investor,
      protocol,
      encodeFunctionData({
        abi: financingAbi,
        functionName: "contribute",
        args: [invoice.commitment, amount],
      }),
    );
    await api("investments", "", { hash, wallet: investor });
  }
  prepared = await api<Prepared>(
    `invoices/${invoice.id}/disbursement`,
    "LISTER",
    {},
  );
  await send(lister, prepared.to, prepared.data);
  await send(
    admin,
    token,
    encodeFunctionData({
      abi: mockTokenAbi,
      functionName: "mint",
      args: [settler, 500000000n],
    }),
  );
  await send(
    settler,
    token,
    encodeFunctionData({
      abi: mockTokenAbi,
      functionName: "approve",
      args: [protocol, 500000000n],
    }),
  );
  const repayment = await api<Prepared>("settlements", "SETTLER", {
    invoiceId: invoice.id,
    evidenceReference: `sample-collection/${randomUUID()}`,
    amount: "500000000",
  });
  await send(settler, repayment.to, repayment.data);
  for (const investor of investors.slice(0, 3))
    await send(
      investor,
      protocol,
      encodeFunctionData({
        abi: financingAbi,
        functionName: "claim",
        args: [invoice.commitment],
      }),
    );
  const last = await send(
    settler,
    protocol,
    encodeFunctionData({
      abi: financingAbi,
      functionName: "claimFee",
      args: [invoice.commitment],
    }),
  );
  await verifyProtocolTransaction(client, config, last, settler);
  const listing = await client.readContract({
    address: protocol,
    abi: financingAbi,
    functionName: "getListing",
    args: [invoice.commitment],
  });
  assert.equal(listing.state, 7);
  assert.equal(listing.distributed, 495000000n);
  assert.equal(listing.feePaid, true);
  assert.equal(
    (await client.readContract({
      address: token,
      abi: mockTokenAbi,
      functionName: "balanceOf",
      args: [sme],
    })) - initialSme,
    450000000n,
  );
  assert.equal(
    (await client.readContract({
      address: token,
      abi: mockTokenAbi,
      functionName: "balanceOf",
      args: [treasury],
    })) - initialTreasury,
    5000000n,
  );
  assert.equal(
    await client.readContract({
      address: protocol,
      abi: financingAbi,
      functionName: "liabilities",
      args: [token],
    }),
    0n,
  );
  await syncProtocol(config, db);
  const key = deploymentId(config);
  const recordId = `${key}:${invoice.commitment}`;
  const [projection] = await db
    .select()
    .from(invoiceOnchainRecords)
    .where(eq(invoiceOnchainRecords.id, recordId));
  assert.equal(projection.state, 7);
  const positions = await db
    .select()
    .from(investorPositions)
    .where(eq(investorPositions.recordId, recordId));
  assert.equal(positions.length, 3);
  assert.ok(positions.every((p) => p.claimed && p.claimable === "0"));
  const [reconciliation] = await db
    .select()
    .from(settlementReconciliations)
    .where(
      and(
        eq(settlementReconciliations.invoiceId, invoice.id),
        eq(settlementReconciliations.deploymentId, key),
      ),
    );
  assert.equal(reconciliation.status, "DEPOSITED");
  const before = await db
    .select()
    .from(blockchainEvents)
    .where(eq(blockchainEvents.deploymentId, key));
  await syncProtocol(config, db);
  const after = await db
    .select()
    .from(blockchainEvents)
    .where(eq(blockchainEvents.deploymentId, key));
  assert.equal(before.length, after.length);
  const fake = await fetch(`${web}/api/v1/investments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hash: `0x${"0".repeat(64)}`, wallet: investors[0] }),
  });
  assert.equal(fake.status, 422);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        invoice: invoice.id,
        commitment: invoice.commitment,
        state: "SETTLED",
        transactions: hashes.length,
        investorDistributions: "495000000",
        platformFee: "5000000",
        projectionPositions: positions.length,
        idempotentSync: true,
        anonymousInvoiceAccess: "rejected",
        fabricatedTransaction: "rejected",
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
