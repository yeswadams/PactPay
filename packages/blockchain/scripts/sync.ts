import { connectDatabase } from "@pactpay/database";
import { loadNetwork } from "./runtime.ts";
import { syncProtocol } from "../src/clients/sync.ts";
const { db, sql } = connectDatabase();
try {
  console.log(await syncProtocol(await loadNetwork(), db));
} finally {
  await sql.end();
}
