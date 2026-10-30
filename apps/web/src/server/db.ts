import { createDb } from "@pactpay/database";

const url = process.env.DATABASE_URL;

if (!url) {
	throw new Error("DATABASE_URL must be set in apps/web/.env or the environment");
}

/** Shared Drizzle + postgres-js client for route handlers and server actions. */
export const db = createDb(url);

export { db as database, url as databaseUrl };
