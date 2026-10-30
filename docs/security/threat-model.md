# Threat model

| Threat                          | Control and residual exposure                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Forged/duplicate invoice        | Human review, canonical private reference uniqueness, permanent commitment uniqueness; cross-platform duplicates remain possible |
| Leaked invoice data             | Salted on-chain commitment, private authorized API; reference storage is not a document management solution                      |
| Role theft/escalation           | OpenZeppelin AccessControl, separate roles, no signed approvals; admin compromise remains critical                               |
| Oversubscription/double payment | Immutable terms, explicit state guards, contribution caps, per-position claim/refund flags                                       |
| Reentrancy or nonstandard token | ReentrancyGuard, SafeERC20, exact transfer deltas, explicit token allowlist; malicious admin-selected tokens unsupported         |
| Principal diversion             | Fixed beneficiary/treasury, only fully funded disbursement, no arbitrary withdrawal                                              |
| Stuck unsuccessful offer        | Pull refunds at funding expiry or at undisbursed full offer maturity, available during pause                                     |
| Fake customer payment           | Operator evidence record plus actual exact token transfer; evidence authenticity remains trusted                                 |
| Replayed reconciliation         | Unique evidence commitment on-chain, private reference and per-invoice uniqueness in DB                                          |
| Fake tx hash / stale index      | Canonical receipt/log verification, confirmation lag, atomic idempotent worker and reorg replay                                  |
| Compromised RPC                 | Chain/address checks and hashes; trusted RPC can still lie. Production requires independent provider strategy                    |
| API abuse                       | Zod, bounded request size, role credentials, sanitized errors; production rate limiting and identity onboarding still required   |
| Borrower default                | Explicit overdue status and risk disclosures; no insurance or guaranteed recovery                                                |

Invariant tests cover accounting across four concurrent offers and random actors,
amounts, time advances, funding completion, disbursement, repayment, refunds and
claims. Balance deltas assume a standard non-rebasing, non-taxed settlement token.
Direct token donations are unallocated and cannot be rescued by an administrator.
