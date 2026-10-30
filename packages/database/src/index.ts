import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

export function createDb(url: string, options?: { max?: number }) {
  const sql = postgres(url, { max: options?.max ?? 10 });
  return drizzle(sql, { schema });
}

export { sql } from "drizzle-orm";
export * as schema from "./schema";
export * from "./schema";
