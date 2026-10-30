# PactPay application integration RFC

30 October 2026. Existing feature/intergrations checkout; local and Sepolia mock-token application.

## Audit and synchronization

The repository's default branch is `master`, not `main`. Fetching origin/main
fails because that ref does not exist; fetch and fast-forward origin/master
instead. Preserve the current feature branch and all merged backend/Web3 work.

The merged backend introduced password accounts, business invoices and document
bytes in PostgreSQL. Its schema replaced the Web3 schema while Web3 consumers still
import missing projections and connection helpers. Two unrelated 0000 migrations
exist; only the backend baseline is journaled. Legacy funding/settlement endpoints
change database flags without chain transactions. Those simulated financial writes
must be retired in favor of the existing canonical event worker.

## Integration decisions

- Keep Next App Router, PostgreSQL/Drizzle, the existing businesses/invoices/users,
  and the tested non-upgradeable financing contract. No custody or accounting change.
- Add wallet identity/session/nonce fields and organization memberships to existing
  business records. A wallet authenticates a user; selected organization membership
  determines SME/investor access. Global operator scopes are explicitly provisioned
  by a database-backed CLI, never self-selected during onboarding.
- Use ERC-4361 SIWE through viem. A short-lived one-use DB challenge is bound to an
  HttpOnly challenge cookie, exact server-created message, domain/URI/chain and
  expiry. Opaque session tokens are hashed in DB, expire, use HttpOnly SameSite
  cookies and Secure on HTTPS. Mutation routes enforce configured Origin. Wallet
  changes/disconnect hide protected UI immediately and revoke the session.
- Restore Web3 projections additively and map commitments/immutable approved terms
  onto existing invoices. Keep KES minor amounts separate from six-decimal MOCK.
  No conversion, custody, legal assignment or settlement rights change.
- New files go into a private S3-compatible bucket (MinIO locally). Validate size
  and magic bytes; serve downloads through organization/verifier authorization.
  Retain legacy DB document bytes for authorized historical reads, but do not write
  new files there. No public URLs, customer fields or evidence on-chain.
- A draft → submitted → needs-information/confirmed/rejected verification process
  is separate from canonical funding/disbursement/repayment state. Immutable terms
  are approved only after human verification. Privileged APIs prepare calldata;
  the corresponding wallet role must sign. No database-only financial success.
- Use server-rendered protected layouts/initial data, small client feature islands,
  a responsive sidebar, accessible shadcn-style Radix primitives, Lucide, React
  Hook Form/Zod, URL filters, TanStack Query and the existing wallet/viem clients.
- Preserve previous demo databases. If a database still has the incompatible old
  Web3-only schema, migration must fail explicitly; the new demo uses a separate
  dedicated database rather than silently rewriting private or financial records.

## Phases and checks

1. Fetch/audit and additive schema repair. Typecheck and migration against a new DB.
2. Design tokens, primitives and role-aware shell. Component tests/Storybook.
3. SIWE, sessions, organizations and onboarding. Nonce/replay/domain/access tests.
4. SME draft/submission and private object documents. Ownership/upload integration.
5. Searchable/paginated marketplace, details, actual contribution/claim workflows.
6. Scoped verification/listing/settlement/audit workflows and signed transactions.
7. Reuse canonical worker; verify finality, idempotency and reorganizations.
8. Vitest/RTL, Playwright with a test-only Anvil EIP-1193 wallet, real-service demo,
   Nx checks, Storybook build, architecture and Foundry/Sepolia keystore runbook.

No production identity verification or live bank collections are implied. Eligibility
and organization verification remain PENDING until an authorized operator decides.
