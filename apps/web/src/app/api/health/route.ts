import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { handler, ok } from "@/server/http";

export async function GET() {
  return handler(async () => {
    try {
      await db.execute(sql`select 1`);
      return ok({ status: "ok", database: "connected" });
    } catch {
      return ok({ status: "ok", database: "unavailable" });
    }
  })();
}
