# Contract architecture

`PactPayFinancing` combines the registry and financing ledger. Approval stores
immutable terms under a salted invoice commitment. A distinct listing operator
opens the offer. There is no second registry address to accidentally misconfigure.
`MockSettlementToken` is an OpenZeppelin ERC-20 with six decimals and restricted
minting; it has no peg, redemption promise or monetary value.

| Role               | Permission                                                       |
| ------------------ | ---------------------------------------------------------------- |
| DEFAULT_ADMIN_ROLE | Grant/revoke roles, configure token allowlist, unpause           |
| VERIFIER_ROLE      | Approve exact immutable terms, once per commitment               |
| LISTER_ROLE        | Open approved offers, disburse fully funded offers               |
| SETTLER_ROLE       | Transfer exact full reconciled repayment into contract           |
| PAUSER_ROLE        | Stop approvals, listings, funding, disbursement                  |
| INVESTOR_ROLE      | Contribute to an open, unexpired offer                           |
| Any account        | Expire, mark overdue, trigger fixed-recipient platform fee       |
| Position owner     | Refund and repayment claims, including after eligibility removal |

Use separately controlled testnet addresses. Admin is trusted to assign roles;
role separation does not protect against a malicious or compromised administrator.
A production design requires reviewed administrative custody and delay policies.

Amounts are uint256 base units; deadlines are uint64 Unix seconds. Target and
repayment are positive with repayment >= target and fee <= repayment - target.
The investor pool is repayment - fee. Per-position claim is
`Math.mulDiv(pool, contribution, target)` rounded down. A final claimant triggers
any residual pool dust payment to the original SME beneficiary. Fee recipient,
fee amount, token and beneficiary cannot be edited after verification.

The per-token `liabilities` counter increases on accepted contributions and
repayment; it decreases on disbursement, refunds, claims, fees and dust. For
supported standard tokens, balance >= liabilities (exact equality absent direct
donations). Unexpected incoming/outgoing transfer deltas revert atomically.
No rescue withdrawal, transfer of positions, investor loops, proxy or upgrade key.

Non-upgradeable releases use new addresses for new offers. Old positions remain
at their original contract until claimed. Retain versioned manifests and ABIs.
