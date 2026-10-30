# PactPay demo — ready-to-present flow

Open **http://127.0.0.1:3001/login**. The integrated local server is running with
PostgreSQL, authenticated private S3 object storage and real Anvil contracts.
Use the local Anvil wallets on **chain 31337**, RPC **http://127.0.0.1:8545**.
Connecting a wallet is followed by an actual SIWE signature; no password is needed.

Both `http://localhost:3001/login` and `http://127.0.0.1:3001/login` work.
Sign-in messages bind to the host you opened; sessions stay on that host.
Real wallet login, dashboard access and reload were browser-tested on both hosts,
with no hydration errors. Other origins and ports remain blocked.

## Wallet roles (Anvil account index)

| Account | Demo role                                   |
| ------- | ------------------------------------------- |
| 0       | Protocol administrator / treasury / audit   |
| 1       | Invoice verifier                            |
| 2       | Listing and disbursement operator           |
| 3       | Repayment settlement operator               |
| 5       | SME with the populated financing example    |
| 6, 7, 8 | Approved investors with mock tokens         |
| 9       | SME created by the browser submission check |

These are disposable local wallets, not your Sepolia keystore. Use Anvil's printed
local account details in a separate development-wallet profile. The public local
addresses are listed below; no real wallet secrets are included here.

## Five-minute presentation

Your wallet `0x95C7108D32E196bb9F25B59386026ec8D3998918` is also enabled as a
local verifier and listing/disbursement operator, with matching contract roles.
It was funded with 0.1 local ETH for gas. Sign in on chain 31337 and open
`/app/admin/verification` or `/app/admin/approvals`; no organization onboarding
is required for an operator.

1. **SME (account 5):** Connect and sign in. Overview shows real invoice metrics.
   Open My Invoices, then the settled example to show private evidence and the
   human verification timeline. New uploads are in private S3 storage.
2. **Verifier (account 1):** Show Verification Queue and Financing Approvals.
   Decisions require a reason and supporting evidence. Approval records immutable
   terms; it does not pretend funding has happened.
3. **Investor (account 6):** Open Marketplace. There is a separate open offer for
   live participation. Review the detail page, enter a small amount such as 1 MOCK,
   approve the exact amount, then fund in a separate transaction. Wait for
   “Confirmed and synchronized.” The offer may already contain the browser test's
   1 MOCK contribution; all displayed progress is actual on-chain state.
4. **Investor dashboard:** Show the previously settled example, contributions,
   realized distributions, and canonical transaction history. Expected contractual
   returns are explicitly separate from realized claims.
5. **Settlement operator (account 3):** Show the DEPOSITED collection record and
   settled financing state. The completed demo paid 450 MOCK to the SME, accepted
   500 MOCK, distributed 495 MOCK to three investors, and paid 5 MOCK to treasury.

The automated full lifecycle has already passed with 21 real transactions. It
also checked one-use/expired/domain-bound SIWE messages, CSRF, organization
ownership, anonymous S3 denial, investor document restrictions, idempotency and
canonical transaction verification. Browser checks covered onboarding, private
upload, actual funding, wallet rejection, mobile navigation and account switching.

## If you need to restart

```sh
pnpm demo:local
```

Stop only the existing demo process first; another Next dev server can remain on
port 3000 because the demo uses its own `.next-demo` directory. The dedicated
`pactpay_integration` database preserves earlier demo databases. The demo creates
fresh contract addresses and an explicit new sample journey, plus an open offer.

After deploying fresh local contracts, restore your wallet's local roles with:

```sh
pnpm demo:operator 0x95C7108D32E196bb9F25B59386026ec8D3998918
```

## Live ETH transfer

Anvil is already running on `http://127.0.0.1:8545`, chain ID `31337`, currency
`ETH`. Keep it running during the demo. In your wallet, select that network and
send `0.01 ETH` from your enabled operator wallet to another demo wallet, for
example the SME at `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc`. Show the wallet's
confirmed transaction and inspect its receipt with:

```sh
cast receipt YOUR_TRANSACTION_HASH --rpc-url http://127.0.0.1:8545
cast balance 0x95C7108D32E196bb9F25B59386026ec8D3998918 --ether --rpc-url http://127.0.0.1:8545
```

This demonstrates native local ETH. Invoice funding and disbursement use the
separate MOCK token. Anvil transactions do not appear on public Etherscan.
If Anvil is stopped, restarting an empty node does not restore deployed contracts;
run `pnpm demo:local` to rebuild the integrated demo. To start a standalone empty
node manually, use `anvil --host 127.0.0.1 --port 8545 --chain-id 31337`.

## Sepolia deployment using your keystore

Follow **docs/deployment/sepolia-keystore-and-etherscan.md**. It covers simulation,
managed keystore broadcasting, publishing both contracts to Etherscan, retrying
verification and exporting the manifest. Sepolia has not been broadcast from this
session; that requires your funded account, RPC and Etherscan API key.

## Demo boundaries

MOCK has no monetary value. Human verification and collection records in this
local demonstration are explicit samples. No production identity verification,
live bank collection, legal assignment or independent security audit is claimed.
Storybook examples are written; the Storybook build and a complete production
rollout remain outside the verified live-demo evidence unless separately recorded.

## Public local wallet addresses

| Anvil index | Role | Address |
| --- | --- | --- |
| 0 | Administrator / treasury | `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266` |
| 1 | Verifier | `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` |
| 2 | Listing / disbursement | `0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc` |
| 3 | Settlement operator | `0x90f79bf6eb2c4f870365e785982e1f101e93b906` |
| 5 | SME | `0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc` |
| 6 | Investor 1 | `0x976ea74026e726554db657fa54763abd0c3a0aa9` |
| 7 | Investor 2 | `0x14dc79964da2c08b23698b3d3cc7ca32193d9955` |
| 8 | Investor 3 | `0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f` |
| 9 | Browser-demo SME | `0xa0ee7a142d267c1f36714e4a8f75612f20a79720` |

To see the standard disposable Anvil keys in your own terminal, run `anvil --port 18545` and compare these addresses. The existing demo keeps running on port 8545. Import only the intended disposable account into your development wallet, then stop the extra Anvil process. No keys are stored by PactPay.
