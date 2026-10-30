# Known limitations

This is a mock-only local/testnet MVP. It has not been independently audited.

- No real-money collection, live bank/M-Pesa integration, redemption, peg or FX.
- No production identity provider, per-business tenant administration, accreditation
  checks or investor onboarding; operator bearer credentials and one SME are demo
  boundaries. Investor eligibility is a manually granted role.
- Evidence is represented by private references. No PDF upload, document encryption,
  customer identity storage or external verification service is implemented.
- The browser is scoped to the generated manifest's six-decimal mock token;
  independently created listings using other assets require matching configuration.
- No partial repayment, renegotiation, dispute resolution, loss allocation, default
  recovery, invoice sale/transfer, secondary trading or contract upgrades.
- A defaulted loan can remain overdue indefinitely. Investor claims become available
  only after the single full deposit; they never expire once repaid.
- Admin/role-holder compromise and dishonest evidence cannot be solved by EVM checks.
- Reorg recovery replays the entire configured deployment; appropriate for a small
  demo, potentially slow at production scale. Transaction/monitor views cap at 200.
- Checkpoint finality is confirmation-depth based; deep reorganizations remain possible.
- Standalone sync needs a scheduler for continuous operation. RPC failures exit with
  an error and require retry; no broker or persistent daemon is included.
- Public-testnet broadcasting requires operator RPC/faucet funds and managed accounts;
  no public deployment or explorer verification is claimed without those inputs.
- The local automated demo uses unlocked Anvil wallets. Browser screens were checked;
  extension-specific signing requires the user's injected wallet and is a separate
  interactive verification step. No seed phrases are collected by PactPay.

Potential future work: legal assignment review, payment-provider reconciliation,
authenticated organizations, private evidence storage, reviewed default procedures,
public testnet verification and an independent smart-contract audit.
