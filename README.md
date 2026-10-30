# PactPay

**Current integrated demo:** see [DEMO.md](DEMO.md) for wallet-first sign-in, the running local application, and the short presentation sequence. See [Sepolia keystore + Etherscan deployment](docs/deployment/sepolia-keystore-and-etherscan.md) for your existing Foundry account. Older bearer-token setup sections below describe the earlier protocol scaffold and are superseded by this demo guide.

PactPay is a local/testnet invoice-financing prototype for Kenyan SMEs. It connects
human invoice verification, multi-investor mock-token funding, SME disbursement,
reconciled repayment and proportional investor claims using real EVM transactions.

**Mock funds only.** MOCK has six decimals and no monetary value. This project does
not create legally enforceable invoice ownership, verify real documents, collect
real payments or guarantee repayment. See [known limitations](docs/security/known-limitations.md).

## Architecture

- `apps/web`: Next.js 16 App Router, wagmi 3 wallet UI, authorized Route Handlers.
- `packages/contracts`: Solidity 0.8.30, Foundry, OpenZeppelin 5.4.0; one combined
  registry/financing contract plus a development-only settlement token.
- `packages/blockchain`: generated literal ABIs, viem clients, validated deployment
  manifests, receipt verification, deployment/demo tools and event worker.
- `packages/database`: Drizzle/PostgreSQL schema, versioned migration, private
  invoice/evidence references, operator audits and canonical chain projections.

The [protocol RFC](docs/architecture/web3-protocol-rfc.md),
[state machine and sequence diagram](docs/architecture/financing-lifecycle.md),
[contract design](docs/architecture/contract-architecture.md) and
[trust boundaries](docs/architecture/onchain-offchain-boundaries.md) explain the design.

The accounting model is fixed multi-investor participation with non-transferable
positions. Only a full funding target can be disbursed. A single full repayment
funds the investor pool and fixed platform fee. Unsuccessful funding is refundable;
fully funded but undisbursed offers become refundable at maturity. Claims are pull
based and do not expire. Pause leaves legitimate refunds and repayment available.

KES invoice face values are stored separately in minor units (100 = KES 1).
Contract amounts are integer token base units (1 MOCK = 1,000,000 base units).
There is no assumed KES/MOCK/USD conversion or guaranteed return.

## Prerequisites

- Node.js 24 (native TypeScript stripping is used by operator scripts).
- pnpm 12.16.1, pinned in the root package manifest.
- Foundry 1.8.5 (`forge`, `anvil`, `cast`).
- Docker with Compose for PostgreSQL 17, or an existing PostgreSQL database.
- Ports 8545, 5432 and 3001 for the automated demo.

```bash
pnpm install --frozen-lockfile
```

## Complete automated local demo

```bash
pnpm demo:local
```

This starts/checks local PostgreSQL and Anvil, compiles contracts, generates ABIs,
applies the migration, deploys contracts and roles, starts Next.js on
[http://127.0.0.1:3001](http://127.0.0.1:3001), then exercises:

1. SME submits a sample private invoice reference through the API.
2. Verifier records human verification and exact mock-token terms.
3. Verifier signs on-chain approval; lister opens the offer.
4. Three unlocked local investor wallets receive mock tokens and approve spending.
5. Investors contribute 200, 150 and 100 MOCK toward a 450 MOCK target.
6. Listing operator disburses 450 MOCK to the SME.
7. Settlement operator records sample collection evidence and deposits 500 MOCK.
8. Investors claim 220, 165 and 110 MOCK; the platform receives 5 MOCK.
9. Contract reaches SETTLED; database projections show three claimed positions.
10. Assertions verify final accounting, idempotent sync, denied anonymous invoice
    access and rejection of a fabricated transaction hash.

Every funding/settlement step is a real local transaction. Collection evidence is
explicit sample data; the automated signers are unlocked Anvil accounts, not
browser extensions. Ctrl+C stops child services; PostgreSQL remains in Docker.
The script reuses an already running Anvil but creates a new deployment. Do not
reset that chain while running another demo or synchronization process.

Generated local API credentials are saved with mode 0600 in ignored
`.env.demo.local`, for use in the corresponding role's browser form. These are
local sample credentials, not wallet keys. No credentials are printed to logs.

For a noninteractive check that stops child services after completion:

```bash
pnpm demo:local --check
```

## Manual development and wallet setup

```bash
cp .env.example .env.local
# Set distinct *_API_TOKEN values in .env.local using openssl rand -hex 32.
docker compose -f infra/docker/compose.yaml up -d --wait
pnpm db:migrate
anvil --host 127.0.0.1 --port 8545
```

In another terminal:

```bash
pnpm web3:deploy
pnpm dev
```

Root scripts load `.env.local`. The page shows an explicit setup error if the
manifest, RPC, contract or database is unavailable; no dummy success is shown.
Root `.env.local` credentials are passed to Next via the Nx process. A directly
started Next server needs the same server environment explicitly provided.

Connect an injected wallet on chain 31337, RPC
[http://127.0.0.1:8545](http://127.0.0.1:8545). Use only disposable Anvil accounts
in a separate development wallet profile. The local deployment uses account
indices 0=admin/treasury/minter, 1=verifier, 2=lister, 3=settler, 4=pauser,
5=SME beneficiary, and 6–8=eligible demo investors. The Anvil console provides
local account details. PactPay never asks for a seed phrase.

The **SME & operators** tab accepts a role credential from the corresponding
local env file. Submit sample references, record verification with exact terms,
sign approval with the verifier wallet, then open/disburse with the lister wallet.
Investors connect accounts 6–8 and use **Approve exact amount**, then **Fund invoice**.
The marketplace reads live status, balance, allowance and position from the chain.
The investment tab shows contributions, refunds, repayments and indexed history.
For settlement, approve exact repayment spending, record collection evidence and
sign the deposit. A rejected signature leaves a PREPARED reconciliation that can
be retried. Fee payment always goes to the originally approved treasury.

For the scripted journey against an already configured running web server:

```bash
pnpm web3:demo
```

It expects `.env.local` credentials matching that server. Set `DEMO_WEB_URL` for a
nondefault URL. Interactive extension-specific signing is separate from the
unlocked-account CLI integration test.

## Build, test and ABI generation

```bash
pnpm nx run contracts:build
pnpm nx run contracts:test
pnpm nx run blockchain:generate
pnpm nx run web:build
pnpm check
forge fmt --check --root packages/contracts
forge coverage --root packages/contracts
```

Tests include access control, investor eligibility, duplicates, deadline boundaries,
oversubscription, disbursement, failed-funding refunds, full repayment, claim
rounding/dust, reentrancy, nonstandard token failures, deployment roles, fuzzing
and stateful multi-listing accounting invariants. TypeScript tests verify receipt
finality/canonicality, contract/chain/sender checks and API role separation.
Browser transaction submissions persist locally by wallet and chain and are checked
against live receipts after reload. Generated ABIs are reproducible from pinned sources and committed for type
inference. Foundry caches and node_modules are ignored, never source artifacts.

Nx generates ABIs before the web build/type checks. No deployment secrets or
running database are needed to compile the application. The UI fetches a generated
manifest at runtime; component source contains no deployment addresses.

## Database synchronization

```bash
pnpm web3:sync
```

Schedule this command periodically for a continuously updated marketplace. It
validates chain/contract/version, indexes only finalized protocol events, records
block/transaction/log identity, updates canonical snapshots and checkpoints
atomically, and replays projections after a confirmed reorganization. Set
`BLOCK_CONFIRMATIONS` explicitly for the target network; Anvil uses 1.
Reconciliation status changes to DEPOSITED only for matching canonical deposits.

The local destructive-to-chain-only reorg test must run with no concurrent chain
writers; private business records remain intact:

```bash
node --env-file=.env.local packages/blockchain/scripts/test-reorg.ts
```

Schema changes: run `pnpm --filter @pactpay/database db:generate`, review the SQL,
then `pnpm db:migrate`. Existing users/invoices are reused across projections;
chain events never overwrite human verification decisions.

## API boundary

| Endpoint under `/api/v1`                            | Access / behavior                                           |
| --------------------------------------------------- | ----------------------------------------------------------- |
| GET blockchain/config, blockchain/listings          | Public mock deployment and canonical financing data         |
| GET investments?wallet=, blockchain/history?wallet= | Validated public wallet projections                         |
| POST investments                                    | Verify canonical receipt; worker updates projections        |
| GET invoices                                        | SME's own sample records or authorized operator             |
| POST invoices                                       | SME sample submission with private evidence reference       |
| POST invoices/:id/verify                            | Verifier's final human decision and exact terms             |
| POST invoices/:id/approval                          | Verifier prepares on-chain approval calldata                |
| POST invoices/:id/listing, disbursement             | Lister prepares role-controlled calldata                    |
| GET/POST settlements                                | Settler inspects/records evidence and prepares full deposit |
| GET blockchain/events                               | Authorized operator monitoring                              |
| POST blockchain/sync                                | Sync-role worker trigger                                    |

Private APIs require `Authorization: Bearer <role token>`; blank/short secrets
fail closed. API authorization does not substitute for contract roles. Only sample
references are supported; uploading real documents or production onboarding is
outside this MVP. There are no privileged signing keys in the application.

## Configurable public testnet deployment

Use an allowed testnet from [ADR 001](docs/adr/001-evm-network-selection.md). Supply
a funded managed Foundry account and distinct role addresses. No public deployment
has been made by this implementation.

```bash
export ALLOW_MOCK_DEPLOYMENT=true
export DEPLOY_CHAIN_ID=11155111
export RPC_URL=https://your-testnet-rpc.example
export DEPLOYER_ADDRESS=0xYourManagedAccountAddress
export PROTOCOL_ADMIN=0xYourAdminAddress
export VERIFIER_ADDRESS=0xYourVerifierAddress
export LISTER_ADDRESS=0xYourListerAddress
export SETTLER_ADDRESS=0xYourSettlerAddress
export PAUSER_ADDRESS=0xYourPauserAddress
forge script script/Deploy.s.sol:Deploy --root packages/contracts \
  --rpc-url "$RPC_URL" --account pactpay-testnet --broadcast
node packages/blockchain/scripts/export-testnet.ts
```

The script requires explicit mock opt-in and matching chain ID. Bootstrap admin
is removed when a separate protocol admin is selected. Grant `INVESTOR_ROLE` to
approved demo investors with the admin's managed account; token minting requires
the mock token's admin. Fund with mock tokens only.

The exporter verifies successful deployment receipts with the configured depth
and writes `packages/blockchain/deployments/<chainId>.json` containing network,
chain, addresses, deployment hashes/block, version and ABI reference. Archive
this manifest with the release. Set `CHAIN_ID`, `RPC_URL`, `NEXT_PUBLIC_RPC_URL`,
`BLOCK_CONFIRMATIONS`, `EXPLORER_URL` and optionally `PACTPAY_DEPLOYMENT_FILE` for
runtime consumption. Public testnets require an explicitly browser-safe
`NEXT_PUBLIC_RPC_URL`; private server RPC credentials are never returned to the
client. `PACTPAY_REAL_MONEY=true` is rejected. Production and unknown
chains fail closed. For explorer verification, use Foundry's `--verify` and that
explorer's configured API key; no verification is claimed until it succeeds.

## Troubleshooting

- **Missing deployment / no code:** start the matching Anvil, run `pnpm web3:deploy`,
  then sync. A reset chain requires a fresh deployment/manifest.
- **Missing DB tables:** set DATABASE_URL and run the reviewed migration.
- **401:** configure a distinct 32+ character token for the selected role and
  restart the server. Never put credentials in NEXT_PUBLIC variables.
- **Role revert:** API credential and connected wallet role are independent.
- **Allowance/balance error:** mint local mock tokens using the admin and approve
  the exact amount before funding/depositing. Use at most six fractional digits.
- **Confirmed transaction, stale list:** run the worker; a browser receipt does
  not guarantee the indexing process has finished.
- **RPC/finality error:** verify chain ID and URL. Confirmations >1 need additional
  mined blocks on Anvil. Worker failures exit nonzero; rerun after RPC recovery.
- **Nx socket restrictions in an agent sandbox:** use `NX_DAEMON=false
NX_ISOLATE_PLUGINS=false` or run with normal local socket permissions.
- **Port already used:** stop the relevant development process; `DEMO_WEB_PORT`
  selects another temporary demo web port.

## Security and next steps

Read the [threat model](docs/security/threat-model.md) and
[trust assumptions](docs/security/trust-assumptions.md). Before real financing,
obtain legal review of assignment/participation, investor eligibility, collections,
recourse, financial-services obligations and privacy; implement production identity,
evidence storage and payment integrations; conduct an independent protocol audit.

People remain responsible for verification and reconciliation. AI may help review
fields later but cannot approve invoices or guarantee creditworthiness. Research
with SME owners and finance teams remains necessary to validate the product.

Team: **TheBears** — Adams Yeswa (product/backend/contracts), Kelvin Korir
(research/pitch/backend/contracts), Cecilia Grace (frontend/UX).
