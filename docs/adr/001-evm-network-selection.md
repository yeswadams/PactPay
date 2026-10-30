# ADR 001 — Anvil first; public testnets configurable

Accepted for demo. Anvil chain 31337 provides deterministic funded wallets,
fast transactions and snapshot/revert tests. Foundry and viem use the same EVM
semantics. No public network was selected in the scaffold and none is presumed.

Generated mock-only manifests support explicitly recognized testnet chain IDs:
31337, 11155111, 84532, 421614, 80002, 11155420, 97 and 43113. RPC and confirmation
depth are configured, not hardcoded in frontend components. Additional networks
require a reviewed configuration change. Production/unknown chains fail closed.

Alternatives: a public testnet by default creates RPC and faucet dependencies in
CI; a mainnet launch creates financial exposure outside this assignment.
