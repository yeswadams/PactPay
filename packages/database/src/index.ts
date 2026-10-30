import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index.ts";
export function connectDatabase(
  url = process.env.DATABASE_URL,
  options?: { max?: number },
) {
  if (!url) throw new Error("DATABASE_URL is required");
  const sql = postgres(url, { max: options?.max ?? 10, prepare: false });
  return { db: drizzle(sql, { schema }), sql };
}
export const createDb = (url: string, options?: { max?: number }) =>
  connectDatabase(url, options).db;
export type Database = ReturnType<typeof createDb>;
export * as schema from "./schema/index.ts";
export * from "./schema/index.ts";
export { eq, and, sql, sql as sqlExpression } from "drizzle-orm";
