# On-chain and off-chain boundaries

| Private PostgreSQL / human process                     | Public chain                                 |
| ------------------------------------------------------ | -------------------------------------------- |
| Canonical invoice reference, random salt               | Salted invoice commitment                    |
| KES face value in minor units                          | Mock token amounts in base units             |
| Customer checks and supporting evidence references     | Verifier transaction and approved terms      |
| Actual customer collection and reconciliation evidence | Operator's full mock-token deposit           |
| Demo identity / role credentials, audit log            | Wallet roles, contributions, refunds, claims |

The prototype accepts private sample evidence references. It does not implement a
file-upload/storage service or an external buyer/payment verification integration.
No documents or identities are sent to the chain. Operator API access uses distinct
server-configured bearer credentials; there is one demo SME identity. Request
bodies cannot choose another invoice owner. Production needs proper user sessions,
organization membership, per-user permissions and controlled evidence storage.

The API prepares privileged calldata but never signs it. A human-controlled wallet
or Foundry account must hold the separate on-chain role. A copied calldata payload
cannot bypass AccessControl. An authorized settler can lie about off-chain evidence;
the contract can only require that the corresponding tokens actually arrive.

## Synchronization and finality

Run `pnpm web3:sync` independently or schedule it. Never rely on browser listeners.
The worker validates chain/version/addresses and reads at `tip - confirmations + 1`.
Use one confirmation on Anvil; select an explicit depth suitable for the chosen
public testnet (three in the example; depth is a risk policy, not absolute finality).
The worker uses 1,000-block chunks, transaction-scoped PostgreSQL advisory locks,
unique transaction/log identity, canonical block hashes and an atomic checkpoint.
It refreshes contract snapshots and investor positions at that same block.

On a checkpoint hash mismatch, tip rollback, or increased confirmation depth, it
deletes only that deployment's chain projections and replays from deployment.
Private invoices, evidence and audits remain; reconciliation statuses are reset
and re-derived from matching canonical deposits. RPC errors roll back the current
chunk; viem retries transport errors three times, then the command exits nonzero.
Rerun/schedule retries externally. No message broker is required.

Submitted transaction hashes are hints. Verification checks configured RPC chain,
contract code/version, successful receipt, destination, expected sender, decoded
contract logs, confirmation depth and canonical block hash. The worker owns
projections; submitted hashes never directly set invoice financing flags.
