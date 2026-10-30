# ADR 002 — Fixed multi-investor demo participation

Accepted for MVP. Use non-transferable balances keyed by invoice commitment and
wallet. An eligible investor contributes before a funding deadline toward a fixed
target. The entire target is required before disbursement; no auction or NFT.

Alternative legal structures include outright assignment and loan participation.
This implementation models participation accounting only. The choice avoids
claiming that a token transfers real payment rights. Kenyan counsel must determine
assignment, debtor consent, investor eligibility, recourse, disputes, collections
and licensing before real financing. No legal approval is implied.

Eligibility is a manually administered on-chain role for demo wallets. It is not
identity verification, accreditation or regulatory compliance. Revocation blocks
new contributions, never refunds or existing claims.
