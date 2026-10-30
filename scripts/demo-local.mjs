import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
const check = process.argv.includes("--check");
const env = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://pactpay:pactpay_dev@127.0.0.1:5432/pactpay",
  RPC_URL: "http://127.0.0.1:8545",
  CHAIN_ID: "31337",
  NEXT_PUBLIC_RPC_URL: "http://127.0.0.1:8545",
  BLOCK_CONFIRMATIONS: "1",
  NX_DAEMON: "false",
  NX_ISOLATE_PLUGINS: "false",
};
for (const role of ["SME", "VERIFIER", "LISTER", "SETTLER", "SYNC"])
  env[`${role}_API_TOKEN`] = randomBytes(32).toString("hex");
const children = [];
function cleanup() {
  for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});
function run(command, args) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed`);
}
async function alive(url, rpc = false) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(2000),
      ...(rpc
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "eth_chainId",
              params: [],
            }),
          }
        : {}),
    });
    return rpc ? (await response.json()).result === "0x7a69" : response.ok;
  } catch {
    return false;
  }
}
async function waitFor(url, rpc = false, child) {
  for (let i = 0; i < 120; i++) {
    if (child && child.exitCode !== null)
      throw new Error(`Service exited before becoming ready: ${url}`);
    if (await alive(url, rpc)) return;
    await delay(500);
  }
  throw new Error(`Service did not start: ${url}`);
}
try {
  run("docker", [
    "compose",
    "-f",
    "infra/docker/compose.yaml",
    "up",
    "-d",
    "--wait",
  ]);
  if (!(await alive(env.RPC_URL, true)))
    children.push(
      spawn("anvil", ["--host", "127.0.0.1", "--port", "8545", "--silent"], {
        env,
        stdio: "inherit",
      }),
    );
  await waitFor(env.RPC_URL, true);
  run("forge", ["build", "--root", "packages/contracts"]);
  run("node", ["packages/blockchain/scripts/generate.mjs"]);
  run("node", ["packages/database/src/migrate.ts"]);
  run("node", ["packages/blockchain/scripts/deploy-local.ts"]);
  if (!check)
    await writeFile(
      ".env.demo.local",
      Object.entries(env)
        .filter(
          ([key]) =>
            [
              "DATABASE_URL",
              "RPC_URL",
              "CHAIN_ID",
              "NEXT_PUBLIC_RPC_URL",
              "BLOCK_CONFIRMATIONS",
            ].includes(key) || key.endsWith("_API_TOKEN"),
        )
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n",
      { mode: 0o600 },
    );
  const port = process.env.DEMO_WEB_PORT ?? "3001";
  env.DEMO_WEB_URL = `http://127.0.0.1:${port}`;
  const next = spawn(
    "node",
    [
      "apps/web/node_modules/next/dist/bin/next",
      "dev",
      "apps/web",
      "--hostname",
      "127.0.0.1",
      "--port",
      port,
    ],
    { env, stdio: "inherit" },
  );
  children.push(next);
  await waitFor(`${env.DEMO_WEB_URL}/api/v1/blockchain/config`, false, next);
  run("node", ["packages/blockchain/scripts/demo.ts"]);
  if (check) cleanup();
  else {
    console.log(
      `Demo complete. Dashboard: ${env.DEMO_WEB_URL}. Ctrl+C stops child services. PostgreSQL remains in Docker.`,
    );
    console.log(
      "Generated local role credentials are in .env.demo.local (mode 0600). Use them only with this local demo.",
    );
    await new Promise((resolve) => next.on("exit", resolve));
  }
} catch (error) {
  console.error(error);
  cleanup();
  process.exitCode = 1;
}
