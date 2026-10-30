import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index.ts";
export function connectDatabase(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is required");
  const sql = postgres(url, { max: 5, prepare: false });
  return { db: drizzle(sql, { schema }), sql };
}
export * from "./schema/index.ts";
export { eq, and, sql as sqlExpression } from "drizzle-orm";
