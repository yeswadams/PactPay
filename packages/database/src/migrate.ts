import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "./index.ts";
const { db, sql } = connectDatabase();
try {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../migrations/", import.meta.url)),
  });
  console.log("Database migrations complete");
} finally {
  await sql.end();
}
