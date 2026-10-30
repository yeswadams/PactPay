import { db as applicationDatabase } from "./application/repository.ts";
// Lazy connection: builds never require a running database or deployment secrets.
export const db = new Proxy({} as ReturnType<typeof applicationDatabase>, {
  get(_target, key) {
    const connection = applicationDatabase();
    const value = Reflect.get(connection, key);
    return typeof value === "function" ? value.bind(connection) : value;
  },
});
export { db as database };
export const databaseUrl = process.env.DATABASE_URL;
