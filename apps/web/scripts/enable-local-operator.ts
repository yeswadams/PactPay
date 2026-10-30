import {
  connectDatabase,
  users,
  operatorGrants,
  auditLogs,
} from "@pactpay/database";
import { assertDeployment, financingAbi } from "@pactpay/blockchain";
import {
  createWalletClient,
  getAddress,
  http,
  keccak256,
  parseEther,
  toHex,
  zeroHash,
} from "viem";
import { anvil } from "viem/chains";
import { network } from "../src/server/blockchain/runtime.ts";

const recipient = getAddress(process.argv[2] ?? "");
const rpc = new URL(process.env.RPC_URL ?? "http://127.0.0.1:8545");
if (!["localhost", "127.0.0.1"].includes(rpc.hostname))
  throw new Error("This command only enables operators on local Anvil");
const { client, config } = await network();
if (
  config.deployment.chainId !== 31337 ||
  !config.deployment.mock ||
  (await client.getChainId()) !== 31337
)
  throw new Error(
    "This command requires the local mock deployment on chain 31337",
  );
await assertDeployment(client, config);
const wallet = createWalletClient({ chain: anvil, transport: http(rpc.href) });
const [admin] = await wallet.getAddresses();
if (
  !admin ||
  !(await client.readContract({
    address: config.deployment.financing,
    abi: financingAbi,
    functionName: "hasRole",
    args: [zeroHash, admin],
  }))
)
  throw new Error(
    "The local node must expose its authorized development administrator",
  );
const hashes: string[] = [];
for (const role of ["VERIFIER_ROLE", "LISTER_ROLE"] as const) {
  const args = [keccak256(toHex(role)), recipient] as const;
  if (
    await client.readContract({
      address: config.deployment.financing,
      abi: financingAbi,
      functionName: "hasRole",
      args,
    })
  )
    continue;
  const hash = await wallet.writeContract({
    account: admin,
    address: config.deployment.financing,
    abi: financingAbi,
    functionName: "grantRole",
    args,
  });
  if ((await client.waitForTransactionReceipt({ hash })).status !== "success")
    throw new Error(`Granting ${role} reverted`);
  hashes.push(hash);
}
const balance = await client.getBalance({ address: recipient });
if (balance < parseEther("0.05")) {
  const hash = await wallet.sendTransaction({
    account: admin,
    to: recipient,
    value: parseEther("0.1") - balance,
  });
  if ((await client.waitForTransactionReceipt({ hash })).status !== "success")
    throw new Error("Local gas funding reverted");
  hashes.push(hash);
}
const { db, sql } = connectDatabase();
try {
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        walletAddress: recipient.toLowerCase(),
        name: "Demo operator",
        role: "reviewer",
      })
      .onConflictDoUpdate({
        target: users.walletAddress,
        set: { walletAddress: recipient.toLowerCase() },
      })
      .returning();
    for (const scope of ["verifier", "lister"] as const)
      await tx
        .insert(operatorGrants)
        .values({ userId: user.id, scope, grantedBy: "explicit-local-demo" })
        .onConflictDoNothing();
    await tx
      .insert(auditLogs)
      .values({
        actor: "explicit-local-demo",
        action: "LOCAL_OPERATOR_ENABLED",
        subject: user.id,
        details: {
          wallet: recipient,
          chainId: 31337,
          scopes: ["verifier", "lister"],
          transactions: hashes,
        },
      });
  });
  console.log(
    JSON.stringify({
      wallet: recipient,
      chainId: 31337,
      scopes: ["verifier", "lister"],
      balanceWei: String(await client.getBalance({ address: recipient })),
      transactions: hashes,
    }),
  );
} finally {
  await sql.end();
}
