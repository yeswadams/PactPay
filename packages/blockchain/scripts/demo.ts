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
  invoiceDocuments,
  walletChallenges,
  eq,
  and,
} from "@pactpay/database";
import { financingAbi, mockTokenAbi } from "../src/abi/index.ts";
import { configuredChain } from "../src/config/index.ts";
import { protocolClient } from "../src/clients/index.ts";
import { syncProtocol, deploymentId } from "../src/clients/sync.ts";
import { loadNetwork } from "./runtime.ts";
const config = await loadNetwork();
if (config.deployment.chainId !== 31337)
  throw new Error("The integration demo is local Anvil only");
const client = protocolClient(config);
const wallet = createWalletClient({
  chain: configuredChain(config),
  transport: http(config.rpcUrl),
});
const accounts = await wallet.getAddresses();
const [admin, verifier, lister, settler, outsider, sme] = accounts;
const investors = accounts.slice(6, 9);
const protocol = config.deployment.financing;
const token = config.deployment.token;
const web = process.env.DEMO_WEB_URL ?? "http://127.0.0.1:3001";
const { db, sql } = connectDatabase();
const hashes: Hash[] = [];
const jars = new Map<string, Map<string, string>>();
function jar(account: Address) {
  if (!jars.has(account)) jars.set(account, new Map());
  return jars.get(account)!;
}
async function request(
  path: string,
  account?: Address,
  body?: unknown,
  options: { method?: string; origin?: string; cookie?: string } = {},
) {
  const cookies = account ? jar(account) : new Map<string, string>();
  const form = body instanceof FormData;
  const response = await fetch(`${web}/api/v1/${path}`, {
    method: options.method ?? (body !== undefined ? "POST" : "GET"),
    headers: {
      Origin: options.origin ?? web,
      ...(form ? {} : { "Content-Type": "application/json" }),
      Cookie:
        options.cookie ??
        Array.from(cookies)
          .map(([key, value]) => `${key}=${value}`)
          .join("; "),
    },
    ...(body !== undefined ? { body: form ? body : JSON.stringify(body) } : {}),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return response;
}
async function api<T>(
  path: string,
  account: Address,
  body?: unknown,
): Promise<T> {
  const response = await request(path, account, body);
  const data = await response.json();
  assert.ok(response.ok, `${path}: ${JSON.stringify(data)}`);
  return data.data as T;
}
async function signIn(account: Address) {
  const challenge = await api<{ message: string }>("auth/challenge", account, {
    address: account,
    chainId: 31337,
  });
  const cookie = Array.from(jar(account))
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
  const signature = await wallet.signMessage({
    account,
    message: challenge.message,
  });
  await api("auth/verify", account, { message: challenge.message, signature });
  assert.equal(
    (
      await request(
        "auth/verify",
        account,
        { message: challenge.message, signature },
        { cookie },
      )
    ).status,
    401,
    "Consumed nonce cannot be replayed",
  );
}
async function send(account: Address, to: Address, data: Hex) {
  const hash = await wallet.sendTransaction({ account, to, data, value: 0n });
  assert.equal(
    (await client.waitForTransactionReceipt({ hash })).status,
    "success",
  );
  hashes.push(hash);
  return hash;
}
type Prepared = { to: Address; data: Hex };
type Invoice = { id: string; commitment: Hash };
type Session = {
  organization: { id: string; eligibilityStatus: string };
  user: { id: string };
};
const run = randomUUID();
try {
  assert.equal((await request("invoices")).status, 401);
  assert.equal(
    (
      await request(
        "auth/challenge",
        undefined,
        { address: sme, chainId: 31337 },
        { origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  await signIn(sme);
  await signIn(verifier);
  await signIn(lister);
  await signIn(settler);
  await signIn(outsider);
  assert.equal(
    (
      await request("auth/challenge", outsider, {
        address: outsider,
        chainId: 1,
      })
    ).status,
    400,
  );
  const invalid = await api<{ message: string }>("auth/challenge", outsider, {
    address: outsider,
    chainId: 31337,
  });
  const changed = invalid.message.replace(
    "Sign in to PactPay.",
    "Sign in to another app.",
  );
  const signature = await wallet.signMessage({
    account: outsider,
    message: changed,
  });
  assert.equal(
    (await request("auth/verify", outsider, { message: changed, signature }))
      .status,
    401,
  );
  const expired = await api<{ message: string }>("auth/challenge", outsider, {
    address: outsider,
    chainId: 31337,
  });
  await db
    .update(walletChallenges)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(walletChallenges.message, expired.message));
  assert.equal(
    (
      await request("auth/verify", outsider, {
        message: expired.message,
        signature: await wallet.signMessage({
          account: outsider,
          message: expired.message,
        }),
      })
    ).status,
    401,
  );
  await api("onboarding", sme, {
    name: "Demo SME owner",
    email: `sme-${run}@example.invalid`,
    organizationName: `Demo produce supplier ${run.slice(0, 6)}`,
    kind: "sme",
    registrationNumber: "DEMO-REG-001",
    contactPhone: "Demo contact only",
    discloseName: true,
  });
  await api("onboarding", outsider, {
    name: "Other demo SME",
    email: `other-${run}@example.invalid`,
    organizationName: "Other demo business",
    kind: "sme",
    registrationNumber: "DEMO-REG-002",
    contactPhone: "",
    discloseName: false,
  });
  assert.equal(
    (
      await request("onboarding", sme, {
        name: "Attacker",
        email: "attacker@example.invalid",
        organizationName: "Unauthorized",
        kind: "administrator",
      })
    ).status,
    400,
  );
  const dueDate = new Date(Date.now() + 60 * 86400000)
    .toISOString()
    .slice(0, 10);
  const input = {
    invoiceNumber: `DEMO-${run.slice(0, 8)}`,
    customerName: "Private demo customer",
    customerEmail: "private-customer@example.invalid",
    customerContact: "Private demo contact",
    description:
      "Sample invoice for produce delivery. Explicit local demo evidence only.",
    faceValueCents: "50000000",
    advanceCents: "45000000",
    dueDate,
    idempotencyKey: randomUUID(),
  };
  const invoice = await api<Invoice>("invoices", sme, input);
  assert.equal(
    (await api<Invoice>("invoices", sme, input)).id,
    invoice.id,
    "Invoice creation is idempotent",
  );
  assert.equal(
    (
      await request("invoices", sme, {
        ...input,
        customerName: "Changed customer",
      })
    ).status,
    409,
  );
  assert.equal((await request(`invoices/${invoice.id}`, outsider)).status, 403);
  assert.equal((await request("admin/audit", sme)).status, 403);
  assert.equal(
    (await request(`invoices/${invoice.id}/submit`, sme, {})).status,
    400,
    "Supporting evidence required",
  );
  const invalidUpload = new FormData();
  invalidUpload.set(
    "file",
    new File(["not a PDF"], "spoof.pdf", { type: "application/pdf" }),
  );
  assert.equal(
    (await request(`invoices/${invoice.id}/documents`, sme, invalidUpload))
      .status,
    415,
  );
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  );
  const upload = new FormData();
  upload.set(
    "file",
    new File([pdf], "demo-invoice.pdf", { type: "application/pdf" }),
  );
  upload.set("kind", "other");
  const document = await api<{ id: string }>(
    `invoices/${invoice.id}/documents`,
    sme,
    upload,
  );
  const download = await request(
    `invoices/${invoice.id}/documents/${document.id}`,
    sme,
  );
  assert.equal(download.status, 200);
  assert.equal(
    Buffer.from(await download.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  assert.equal(
    (await request(`invoices/${invoice.id}/documents/${document.id}`, outsider))
      .status,
    403,
  );
  const [stored] = await db
    .select()
    .from(invoiceDocuments)
    .where(eq(invoiceDocuments.id, document.id));
  assert.equal(stored.content, null);
  assert.ok(stored.objectKey);
  const anonymous = await fetch(
    `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${stored.objectKey}`,
  );
  assert.equal(
    anonymous.status,
    403,
    "Private storage object must reject anonymous reads",
  );
  await api(`invoices/${invoice.id}/submit`, sme, {});
  await api(`invoices/${invoice.id}/review`, verifier, {
    decision: "confirmed",
    notes:
      "Local sample evidence reviewed for demonstration; no real customer or identity verification is represented.",
    evidenceReference: `demo-human-review/${run}`,
  });
  const now = (await client.getBlock()).timestamp;
  const terms = {
    token,
    beneficiary: sme,
    treasury: admin,
    target: "450000000",
    repayment: "500000000",
    fee: "5000000",
    fundingDeadline: (now + 86400n).toString(),
    maturity: (now + 60n * 86400n).toString(),
  };
  let prepared = await api<Prepared>(
    `invoices/${invoice.id}/approval`,
    verifier,
    terms,
  );
  await send(verifier, prepared.to, prepared.data);
  prepared = await api<Prepared>(`invoices/${invoice.id}/listing`, lister, {});
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
    args: [admin],
  });
  for (let index = 0; index < investors.length; index++) {
    const investor = investors[index];
    await signIn(investor);
    const name = `Demo investor ${index + 1} ${run.slice(0, 6)}`;
    await api("onboarding", investor, {
      name: `Demo investor ${index + 1}`,
      email: `investor-${index}-${run}@example.invalid`,
      organizationName: name,
      kind: "investor",
      registrationNumber: "",
      contactPhone: "",
      discloseName: false,
    });
    const queue = await api<
      { id: string; wallet: string; organizationName: string }[]
    >("admin/eligibility", verifier);
    const membership = queue.find(
      (row) =>
        row.wallet === investor.toLowerCase() && row.organizationName === name,
    )!;
    assert.ok(membership);
    await api("admin/eligibility", verifier, {
      membershipId: membership.id,
      status: "APPROVED",
      reason:
        "Explicit local demonstration eligibility check; not real identity verification.",
    });
    assert.equal(
      (await request(`invoices/${invoice.id}`, investor)).status,
      403,
      "Investors must not see private customer or document details",
    );
    const catalog = await api<{ items: Record<string, unknown>[] }>(
      "listings",
      investor,
    );
    assert.ok(catalog.items.some((row) => row.id === invoice.id));
    assert.ok(
      !JSON.stringify(catalog).includes("private-customer@example.invalid"),
    );
    const amount = [200000000n, 150000000n, 100000000n][index];
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
    await api("transactions/verify", investor, { hash });
  }
  prepared = await api<Prepared>(
    `invoices/${invoice.id}/disbursement`,
    lister,
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
  const reconciliationInput = {
    invoiceId: invoice.id,
    evidenceReference: `demo-collection/${run}`,
    amount: "500000000",
  };
  prepared = await api<Prepared>("settlements", settler, reconciliationInput);
  assert.equal(
    (await api<Prepared>("settlements", settler, reconciliationInput)).data,
    prepared.data,
    "Settlement preparation is idempotent",
  );
  await send(settler, prepared.to, prepared.data);
  for (const investor of investors) {
    const hash = await send(
      investor,
      protocol,
      encodeFunctionData({
        abi: financingAbi,
        functionName: "claim",
        args: [invoice.commitment],
      }),
    );
    await api("transactions/verify", investor, { hash });
  }
  await send(
    settler,
    protocol,
    encodeFunctionData({
      abi: financingAbi,
      functionName: "claimFee",
      args: [invoice.commitment],
    }),
  );
  await syncProtocol(config, db);
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
    await client.readContract({
      address: protocol,
      abi: financingAbi,
      functionName: "liabilities",
      args: [token],
    }),
    0n,
  );
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
      args: [admin],
    })) - initialTreasury,
    5000000n,
  );
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
  assert.ok(positions.every((row) => row.claimed && row.claimable === "0"));
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
  assert.equal(
    (await request("transactions/verify", sme, { hash: `0x${"0".repeat(64)}` }))
      .status,
    422,
  );
  // Leave a separate real open offer for interactive exploration and browser tests.
  const openInput = {
    ...input,
    invoiceNumber: `OPEN-${run.slice(0, 8)}`,
    idempotencyKey: randomUUID(),
  };
  const openInvoice = await api<Invoice>("invoices", sme, openInput);
  const secondUpload = new FormData();
  secondUpload.set(
    "file",
    new File([pdf], "open-offer-evidence.pdf", { type: "application/pdf" }),
  );
  await api(`invoices/${openInvoice.id}/documents`, sme, secondUpload);
  await api(`invoices/${openInvoice.id}/submit`, sme, {});
  await api(`invoices/${openInvoice.id}/review`, verifier, {
    decision: "confirmed",
    notes:
      "Explicit sample invoice reviewed to support interactive local demo exploration.",
    evidenceReference: `demo-open-review/${run}`,
  });
  prepared = await api<Prepared>(
    `invoices/${openInvoice.id}/approval`,
    verifier,
    terms,
  );
  await send(verifier, prepared.to, prepared.data);
  prepared = await api<Prepared>(
    `invoices/${openInvoice.id}/listing`,
    lister,
    {},
  );
  await send(lister, prepared.to, prepared.data);
  await syncProtocol(config, db);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        invoice: invoice.id,
        state: "SETTLED",
        transactions: hashes.length,
        investorDistributions: "495000000",
        platformFee: "5000000",
        positions: 3,
        siweReplay: "rejected",
        wrongDomain: "rejected",
        expiredNonce: "rejected",
        unsupportedChain: "rejected",
        csrf: "rejected",
        privateObjectStorage: "verified",
        crossOrganizationAccess: "rejected",
        investorDocumentAccess: "rejected",
        idempotentSubmission: true,
        idempotentSettlement: true,
        idempotentSync: true,
        openOffer: openInvoice.id,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
