# ADR 003 — One full reconciled deposit, proportional pull claims

Accepted for MVP. The approved settlement operator privately records collection
evidence and transfers the exact full repayment in the same approved token.
Recognize repayment once. No partial payments, FX oracle or default recovery.

Every position receives floor((repayment - fixed fee) * contribution / target).
The final claimant returns any residual dust to the SME. The platform receives
exactly the verifier-approved fee. Any account can trigger that fixed-recipient
fee payment, with no ability to redirect it. No investor iteration or claim expiry.

KES face values are integer minor units off-chain. MOCK is six-decimal demo money
only; no KES/USD parity or exchange rate exists. Real FX would require separately
approved rate, timestamp, source, units and conversion records before an offer.
