import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "./index.ts";
const { db, sql } = connectDatabase();
try {
  const columns =
    await sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'users'`;
  if (
    columns.some((c) => c.column_name === "external_id") &&
    !columns.some((c) => c.column_name === "email")
  ) {
    throw new Error(
      "Legacy Web3-only database detected and preserved. Use the integration demo database, or follow docs/architecture/application-migrations.md before migrating existing data.",
    );
  }
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../migrations/", import.meta.url)),
  });
  console.log("Database migrations complete");
} finally {
  await sql.end();
}
