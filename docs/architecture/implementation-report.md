# Implementation report

30 October 2026. Local/testnet MVP; public deployment and production launch excluded.

| Phase | Implemented files / decisions                                                                                                                                                                            | Verification                                                                                                                                                                                                   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | `web3-protocol-rfc.md`, ADRs; audited starter, no existing auth/invoice schema                                                                                                                           | Workspace manifests, CI, app and Counter inspected                                                                                                                                                             |
| 1–2   | `packages/contracts/src`, `test/unit`, `test/integration`, `test/invariant`; combined ledger, exact-term approval, separate roles, eligible investors, immutable terms, pull claims/refunds              | 28 Foundry tests, 256 fuzz cases, 128 × 64 invariant actions; no failures                                                                                                                                      |
| 3     | `packages/contracts/script/Deploy.s.sol`; `packages/blockchain/src`, `scripts/generate.mjs`, deployment scripts; literal ABIs and validated manifests                                                    | Solidity build; local deployment; role initialization/transfer test; TypeScript checks                                                                                                                         |
| 4     | `packages/database/src`, migrations; web `server/blockchain`, `app/api/v1`, `features/wallet`, `features/invoice-financing`; operator credentials and unsigned preparation; atomic finality-aware worker | Receipt/config/auth unit tests; migration against PostgreSQL 17; actual API demo; browser marketplace/operator inspection                                                                                      |
| 5     | `scripts/demo-local.mjs`, blockchain `demo.ts`, `test-reorg.ts`                                                                                                                                          | Real Anvil transactions; three investor projections, exact 495 MOCK pool/5 MOCK fee; zero final liabilities; idempotent replay; anonymous/private access and fabricated tx rejection; confirmed-reorg rollback |
| 6     | CI workflow, README, architecture, ADR/security docs; generated outputs/dependencies removed from tracked source                                                                                         | Nx lint/typecheck/test/build, formatting, coverage; final results recorded below                                                                                                                               |

## Financial evidence

The automated journey sends 450 MOCK from three investors to the SME, deposits
500 MOCK from the operator and pays investors 220/165/110 MOCK and treasury 5 MOCK.
The contract reaches SETTLED, all three positions are claimed, projected claimable
amounts are zero and liabilities are zero. Partial deposits never imply repayment.
Rounding fuzz tests assert that fixed fees, floor investor distributions and SME
dust exactly exhaust the deposit. Stateful tests cover four concurrent listings.

## Commands

```sh
pnpm install --frozen-lockfile
forge fmt --check --root packages/contracts
forge build --root packages/contracts
forge test --root packages/contracts -vvv
forge coverage --root packages/contracts
node packages/blockchain/scripts/generate.mjs
node --test --test-isolation=none packages/blockchain/test/*.test.ts apps/web/src/server/blockchain/*.test.ts
NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run-many -t lint typecheck test build --output-style=static
node scripts/demo-local.mjs --check
DATABASE_URL=postgresql://pactpay:pactpay_dev@127.0.0.1:5432/pactpay node packages/blockchain/scripts/test-reorg.ts
```

During development, a deprecated Foundry `testFail*` name and a Next 16
cacheComponents/runtime-export incompatibility failed initial checks and were
corrected. No tests were suppressed. Next's locally bundled guides were consulted.
Runtime defaults to Node without the incompatible route override.

## Remaining boundaries

See `docs/security/known-limitations.md`. CLI flows use genuine local blockchain
transactions; a user's injected-wallet extension signing remains interactive.
No production identity provider, document upload/storage, live collection/FX,
legal assignment, default recovery or independent security audit is claimed.
Public-testnet scripts are provided but not broadcast without managed operator
accounts and RPC/faucet configuration. GitHub-hosted CI execution requires a push;
the equivalent quality commands are run locally.

## Final verification evidence

- All 28 Foundry tests passed, including the deployment-role transfer test and
  eligibility revocation/refund case. The fuzz case ran 256 inputs; the stateful
  invariant ran 128 sequences × 64 calls with zero reverts.
- All 11 TypeScript receipt/configuration/auth tests passed without skips.
- `forge coverage`: financing source 100% lines, 96.17% statements, 75.76%
  branches; deployment script and mock token 100% lines. Coverage is evidence
  of exercised paths, not an audit or correctness proof.
- Nx lint/typecheck/test/build completed successfully across the four projects.
  The final `web:build` and its two dependencies also passed after the last
  token-display guard; final direct web typecheck and ESLint passed.
- Database schema typechecking passed with its original TypeScript 7 dependency.
- Repeated ABI generation produced identical SHA-256
  `14672a2e360a18bc9344ff86da599a4324f7d26f183758a0e0454f2d395c4a06`.
- Final end-to-end demo: invoice `8e37c8b9-0864-4d1a-bd80-b9cb1d075146`, 19 real
  local transactions, SETTLED, 495,000,000 investor base units, 5,000,000 fee base
  units, three claimed database positions and zero remaining protocol liabilities.
- Final snapshot/revert test removed the orphaned approval event and listing,
  rebuilt canonical projections and exited successfully.
- The live demo runs on port 3001; `.env.demo.local` contains fresh, ignored local
  role credentials with filesystem mode 0600. The original `.env.local` is retained.
- `git diff --check` and the staged generated-file cleanup check passed.

Nonfatal Foundry warnings about timestamp use and intentional exact token balance
deltas remain visible. The application build has no dynamic filesystem tracing
warning: tracing includes only the generated deployment-manifest directory.
