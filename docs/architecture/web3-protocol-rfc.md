# PactPay protocol RFC — v1 demo

Status: implementation specification; no real money or legal rights enabled.

## Repository audit (30 October 2026)

The clean pnpm/Nx workspace contains Next 16.4.3, React 19.3,
wagmi 3.7, viem 2.57, Zod 4.6, Drizzle 0.45 and PostgreSQL 3.4.
The web application is the starter screen; database exports point to missing
source files. There is no authentication, invoice workflow or selected public
network. Contracts contain only Foundry's Counter, forge-std and tracked build
outputs. Foundry 1.8.5 is installed. CI currently builds the starter and tests
Counter, and its pnpm version differs from the workspace pin.

## Decisions

- Local EVM chain: Anvil, chain 31337. Configurable public testnets must provide
  a matching chain ID, RPC, confirmations and generated deployment manifest.
  Mainnet/production deployment is deliberately disabled for this mock-only MVP.
- Foundry supplies compiler, deterministic tests, fuzzing, stateful invariants,
  deployment and local EVM tooling. Pin Solidity and dependency versions.
- One non-upgradeable PactPayFinancing contract combines registry and financing.
  This avoids cross-contract authorization and atomicity risks. Exact terms are
  approved by a verifier, then opened separately by a listing operator. No
  signatures or relayer nonces are needed: commitments are unique forever.
- Participation is the demo accounting assumption: pro-rata non-transferable
  positions, no NFT, cryptocurrency, auction or secondary market. Neither a
  ledger entry nor an invoice commitment transfers legal payment rights.
  Assignment versus participation needs legal review before real financing.
- One allowlisted ordinary ERC-20 per offer. Use a six-decimal OpenZeppelin mock
  for demos only. All contract amounts are base-unit integers. Business KES face
  values are separate metadata; there is no implicit FX conversion.
- Funding is fixed-target, with a deadline earlier than maturity. Disbursement
  requires full funding and a listing operator. Refunds and investor claims are
  pull based. No investor loops. Fully funded offers remain disbursable after
  the funding deadline but only before maturity; after maturity, an undisbursed
  offer expires and investors can refund. This prevents stranded principal.
- A settlement operator reconciles customer payment evidence off-chain, then
  deposits exactly one full repayment. Default/partial repayment and enforcement
  are not implemented. Maturity triggers overdue display, not fabricated payment.
- Each investor receives floor(pool * contribution / target). Once all investors
  have claimed, residual rounding dust goes to the SME beneficiary. Platform
  receives exactly its fixed fee, never principal or rounding residual. Claim
  completion is counted, not iterated. No claim deadlines or confiscation.
- Eligible demo investor wallets hold INVESTOR_ROLE; revocation blocks new funding
  but preserves all existing claims and refunds. This is not regulatory onboarding.
- Admin controls role grants and token allowlisting; separate verifier, lister,
  settler and pauser roles. Admin alone can unpause. Pause blocks new approval,
  listing, contributions and disbursement; expiry, refunds, repayment and claims
  remain available. Existing token positions survive token removal.
- No upgrade proxy, rescue withdrawal or arbitrary token sweep. Migration means
  new version/address for new offers; existing liabilities stay at old address.

## Trust boundaries

Invoice evidence, customer identity, KES amounts, reconciliation references and
human decisions remain in PostgreSQL, protected by server authorization.
On-chain: salted commitments, beneficiaries, token, exact approved terms,
contributions and lifecycle events. Salt is private; duplicate checking within
PactPay additionally uses a canonical off-chain invoice reference. Neither check
can detect financing at another platform. No on-chain statement proves delivery,
creditworthiness or enforceable assignment.

The scaffold lacks an identity provider. MVP API uses separately configured
high-entropy bearer credentials per SME/verifier/listing/settlement/sync role,
with timing-safe comparisons and audit records; credentials stay server side
or in operator tooling, never browser bundles. Wallet public reads need no auth.
This is a local/operator integration boundary, not production user onboarding.
Listing and repayment APIs prepare calldata only; role holders sign transactions
in their wallet or CLI. Server never holds a privileged signing key.

## Synchronization

An independently runnable worker ingests only the configured contract on the
expected chain. Finality lag is configurable (local: 1 block). Persist full log
identity and block hash, plus checkpoints. Replay is idempotent. Validate the
checkpoint hash on every run; a confirmed reorg triggers a transactional rebuild
of blockchain projections from the deployment block, retaining business records
and audit history. Store canonical state reads at the finalized block. Verify
submitted hashes against canonical receipts, successful status, contract events,
chain and confirmation depth; user input never changes funding state.

## Staged implementation and verification

0. Audit and RFC (this file), state machine and threat model.
   1–2. Combined registry/financing, roles, mock token, unit/lifecycle/fuzz/invariant
   tests; forge fmt, build, test and coverage before application integration.
1. Deployment script, versioned manifest, ABI generator, typed viem helpers and
   Nx dependencies. Validate missing/invalid deployment configuration explicitly.
2. Drizzle migrations, authorized API preparation, receipt verification, worker,
   wallet marketplace/portfolio and operator UI using existing Tailwind conventions.
3. Clean Anvil deployment and three-investor transaction demo, database replay.
4. Lint, type checks, application build, CI and final evidence/limitations report.
