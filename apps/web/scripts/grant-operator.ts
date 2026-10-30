import {
  connectDatabase,
  users,
  operatorGrants,
  auditLogs,
  eq,
} from "@pactpay/database";
import { getAddress, isAddress } from "viem";
const args = process.argv.slice(2);
const wallet = args[0];
const scope = args[1];
const reason = args.slice(2).join(" ");
if (
  !wallet ||
  !isAddress(wallet) ||
  !["verifier", "lister", "settler", "auditor", "administrator"].includes(
    scope,
  ) ||
  reason.length < 10
)
  throw new Error(
    "Usage: pnpm admin:grant <wallet> <verifier|lister|settler|auditor|administrator> <reason of at least 10 characters>",
  );
const { db, sql } = connectDatabase();
try {
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        walletAddress: getAddress(wallet).toLowerCase(),
        name: "Operator wallet",
        role: "reviewer",
      })
      .onConflictDoUpdate({
        target: users.walletAddress,
        set: { walletAddress: wallet.toLowerCase() },
      })
      .returning();
    await tx
      .insert(operatorGrants)
      .values({ userId: user.id, scope, grantedBy: "authorized-database-cli" })
      .onConflictDoNothing();
    await tx
      .insert(auditLogs)
      .values({
        actor: "authorized-database-cli",
        action: "OPERATOR_SCOPE_GRANTED",
        subject: user.id,
        details: { scope, reason },
      });
  });
  console.log(
    `Granted ${scope} backend scope to ${getAddress(wallet)}. Contract roles remain separately controlled.`,
  );
} finally {
  await sql.end();
}
