# Trust assumptions

- Verifier checks real invoices, delivery, prior financing and customer acceptance.
- Listing operator opens only approved offers and controls disbursement timing.
- Repayment operator checks actual collection evidence before depositing the full
  obligation. A blockchain cannot query a bank or M-Pesa payment automatically.
- Administrator protects role assignment, token selection and emergency recovery.
  Contract pause/unpause does not freeze legitimate exit and repayment functions.
- Ordinary ERC-20 behavior is required. OpenZeppelin mock supplies that behavior;
  allowlisting alone cannot make an arbitrary token trustworthy.
- RPC, PostgreSQL, host OS, HTTPS and credential custody are trusted operational
  dependencies. Protect and rotate operator API tokens; never expose them through
  NEXT_PUBLIC variables. No signing keys are stored in database or server code.
- Positions establish protocol accounting, not legal ownership or verified claims
  against an SME/customer. Real deployment requires separate legal/security review.
