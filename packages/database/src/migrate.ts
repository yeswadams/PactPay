import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/web/.env"),
  override: true,
});

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL must be set in apps/web/.env or the environment");
  }
  const sql = postgres(url, { max: 1 });
  const migrationsFolder = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../migrations",
  );
  await migrate(drizzle(sql), { migrationsFolder });
  console.log("Migrations applied to", url.replace(/:[^:@/]+@/, ":***@"));
  await sql.end();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
