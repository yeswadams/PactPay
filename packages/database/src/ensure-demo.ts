import postgres from "postgres";
const url = new URL(
  process.env.DATABASE_URL ??
    "postgresql://pactpay:pactpay_dev@127.0.0.1:5432/pactpay_integration",
);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/pactpay_integration"
)
  throw new Error(
    "The demo can provision only local pactpay_integration; existing databases are preserved",
  );
url.pathname = "/postgres";
const sql = postgres(url.toString(), { max: 1 });
try {
  const rows =
    await sql`select datname from pg_database where datname = 'pactpay_integration'`;
  if (!rows.length) await sql.unsafe("create database pactpay_integration");
  console.log("Dedicated local integration database is ready");
} finally {
  await sql.end();
}
