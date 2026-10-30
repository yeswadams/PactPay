# PactPay

**Web3 SME Invoice Liquidity Platform**

Moringa Hackathon 2026 · *People First, AI Second* · *Human-Centered Technology: Building Trust in Communities*

PactPay explores how Kenyan small and medium-sized enterprises (SMEs) could access cash sooner by financing verified, unpaid invoices. The goal is to make the process understandable and auditable, while keeping people—not AI or blockchain—in control of important decisions.

> **Prototype status:** This repository is currently a project scaffold. The web app is the default Next.js starter, and the Foundry contract is a sample `Counter`; the invoice-financing workflow described below is the intended prototype, not functionality available yet. Do not use this project for real financing or submit real business documents.

## The problem

SMEs can wait 30–90 days for customers to pay legitimate invoices while wages, stock, and operating expenses are due now. Limited access to affordable short-term finance can constrain their ability to operate, accept new orders, and grow.

PactPay investigates whether a trusted invoice-financing process can help bridge that gap with clear costs, credible checks, and transparent investor participation.

## Who it is for

- **SMEs:** Registered Kenyan businesses supplying goods or services on credit.
- **Invoice financiers:** Eligible investors considering approved invoices.
- **Business customers:** Customers asked to confirm invoices and delivery.
- **Platform reviewers:** People who check businesses, supporting evidence, and disputes.

These are intended users, not validated findings. The team plans to interview at least three SME owners or finance staff about payment delays, invoice discounting, and trust concerns before treating assumptions as established.

## Proposed experience

1. An SME signs up, submits an unpaid invoice, and uploads supporting evidence such as a purchase order, contract, or delivery record.
2. A human reviewer checks the business and records, seeks confirmation from the customer who owes the invoice, and marks the submission **Submitted**, **Confirmed**, or **Rejected**.
3. Eligible investors can review approved invoices, including the face value, proposed advance, discount, due date, evidence status, and risk warnings.
4. A simulated funding flow records the invoice identifier or hash and funding state on a testnet. Settlement can be simulated, with a readable history for the SME and investor.

### Intended prototype features

- SME onboarding, invoice submission, supporting-document upload, and a human-reviewed verification dashboard.
- An investor view of approved invoices and a simulated funding flow.
- A testnet contract for invoice references, funding state, and simulated settlement.

**Illustrative example only:** An invoice with a face value of KES 500,000 and a 60-day due date might be offered for KES 450,000. If the customer pays in full, the KES 50,000 difference could be allocated between investor return and platform fees under agreed terms. These figures are not a quote, promised return, or live offer.

## People first, AI second

- AI may optionally help extract invoice fields or flag inconsistencies for a reviewer.
- AI does not approve invoices, determine creditworthiness, or guarantee repayment.
- Plain-language pricing, explicit consent, manual review, and explanations for decisions are central to the intended experience.
- Wallets and blockchain are infrastructure; users should not need to understand them to follow the process.

## Trust, safety, and privacy

- Check business identity and registration; compare invoices with purchase orders, contracts, or delivery evidence; and seek confirmation from the customer.
- Check for duplicate submissions and ask SMEs to disclose prior financing.
- Distinguish whether an invoice appears authentic from whether the customer can pay it. Make late-payment and default risks clear.
- Keep sensitive documents off-chain. Restrict access by role, collect only necessary information, encrypt sensitive records, obtain consent, and use document hashes—not personal or commercial details—on-chain.
- Human reviewers handle suspicious submissions, disputes, and appeals.
- Before any real-money launch, define dispute, collection, and loss-allocation procedures and obtain Kenyan legal review of invoice assignment, investor eligibility, financial-services requirements, and data-protection obligations.

Testnet records and tokenized participation do not, by themselves, create enforceable ownership rights. The prototype is not financial, legal, or investment advice.

## Technology

The repository is a pnpm/Nx monorepo with:

- **Web:** Next.js, React, TypeScript, and Tailwind CSS in [`apps/web`](./apps/web).
- **Database package:** Drizzle ORM and PostgreSQL dependencies in [`packages/database`](./packages/database).
- **Smart contracts:** Solidity and Foundry in [`packages/contracts`](./packages/contracts).
- **Local database service:** PostgreSQL configuration in [`infra/docker/compose.yaml`](./infra/docker/compose.yaml).

The intended architecture keeps invoice documents in conventional off-chain storage and uses blockchain only for auditable funding and settlement events. The repository does not yet implement that architecture.

## Getting started

### Web workspace

Requirements: Node.js and pnpm 12.16.1 (the version pinned in the root package manifest).

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). At present, this displays the unmodified Next.js starter page.

Useful workspace commands:

```bash
pnpm build
pnpm lint
pnpm test
pnpm typecheck
```

These run the corresponding Nx targets across configured projects. Some targets may not yet be configured for every package.

### Contracts

Install [Foundry](https://book.getfoundry.sh/getting-started/installation), then run from the repository root:

```bash
forge build --root packages/contracts
forge test --root packages/contracts
```

The contract currently in the repository is the Foundry sample `Counter`, not an invoice-financing contract.

### Optional local PostgreSQL

Docker Compose starts a local development database:

```bash
docker compose -f infra/docker/compose.yaml up -d
```

It listens on `127.0.0.1:5432` with the development-only credentials in the Compose file. Do not reuse these credentials outside local development. The application is not yet wired to this database.

## Hackathon plan

- **Thursday — orientation and discovery:** Interview at least three potential users, map the SME–reviewer–investor journey, validate trust concerns, sketch screens, define contract states, and initialize the repository.
- **Friday, 10:00 AM–12:15 PM — build:** Implement invoice upload with seeded demo data, reviewer approval, investor listing, a testnet funding-state contract, and connected frontend screens.
- **Friday, 12:15 PM–1:30 PM — demo and submit:** Demonstrate a verified invoice, simulated investment, and simulated settlement; test failure states; polish the pitch; submit before 1:30 PM.

**Demo success criterion:** A judge can follow one invoice from submission through human verification, investor funding, and settlement status, and can see both the user-facing explanation and the corresponding testnet record.

## Team

**TheBears**

| Team member | Role |
| --- | --- |
| Adams Yeswa | Product lead; backend and smart contracts |
| Kelvin Korir | User research and pitch; backend and smart contracts |
| Cecilia Grace | Frontend and UX |

## Limitations and future work

The intended prototype uses testnet funds and sample or consented documents. Customer confirmation, identity checks, fraud screening, collections, and real-world settlement may be partly manual or simulated. A token alone does not establish legal ownership or repayment rights.

Future work could include authorized business-verification and payment providers, buyer credit assessment, duplicate-financing controls, dispute management, legally reviewed assignment workflows, compliant investor onboarding, and a small pilot with SMEs and financing partners.
