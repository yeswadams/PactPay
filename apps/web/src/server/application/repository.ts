import { connectDatabase } from "@pactpay/database";
let connection: ReturnType<typeof connectDatabase> | undefined;
export function db() {
  return (connection ??= connectDatabase()).db;
}
export {
  and,
  eq,
  gt,
  desc,
  asc,
  sql,
  ilike,
  or,
  count,
  inArray,
} from "drizzle-orm";
export * as tables from "@pactpay/database/schema";
