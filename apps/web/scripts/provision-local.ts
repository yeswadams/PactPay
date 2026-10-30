import {
  connectDatabase,
  users,
  operatorGrants,
  auditLogs,
} from "@pactpay/database";
import { createPublicClient, createWalletClient, http } from "viem";
const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545";
if (!["127.0.0.1", "localhost"].includes(new URL(rpc).hostname))
  throw new Error("Local fixture provisioning requires a loopback RPC");
const client = createPublicClient({ transport: http(rpc) });
if ((await client.getChainId()) !== 31337)
  throw new Error("Local fixtures require Anvil chain 31337");
const addresses = await createWalletClient({ transport: http(rpc) }).getAddresses();
if (addresses.length < 9)
  throw new Error("Nine Anvil demo accounts are required");
const definitions = [
  {
    index: 0,
    name: "Demo protocol administrator",
    scopes: ["administrator", "auditor"],
  },
  { index: 1, name: "Demo invoice verifier", scopes: ["verifier", "auditor"] },
  { index: 2, name: "Demo listing operator", scopes: ["lister"] },
  { index: 3, name: "Demo repayment operator", scopes: ["settler"] },
];
const { db, sql } = connectDatabase();
try {
  await db.transaction(async (tx) => {
    for (const definition of definitions) {
      const wallet = addresses[definition.index].toLowerCase();
      const [user] = await tx
        .insert(users)
        .values({
          walletAddress: wallet,
          name: definition.name,
          role: "reviewer",
        })
        .onConflictDoUpdate({
          target: users.walletAddress,
          set: { walletAddress: wallet },
        })
        .returning();
      for (const scope of definition.scopes)
        await tx
          .insert(operatorGrants)
          .values({ userId: user.id, scope, grantedBy: "explicit-local-demo" })
          .onConflictDoNothing();
    }
    await tx
      .insert(auditLogs)
      .values({
        actor: "explicit-local-demo",
        action: "LOCAL_FIXTURES_PROVISIONED",
        subject: "chain:31337",
        details: { operators: 4 },
      });
  });
  console.log(
    "Provisioned explicit Anvil-only backend operator scopes; no real identity verification is implied.",
  );
} finally {
  await sql.end();
}
