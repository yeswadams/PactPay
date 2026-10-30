# PactPay protocol

Combined invoice registry/financing ledger and a six-decimal mock settlement token.
See the root README for deployment/demo instructions and docs/architecture for
state transitions, rounding and trust boundaries. Local/testnet only.

```sh
forge fmt --check
forge build
forge test -vvv
forge coverage
```

Dependency: OpenZeppelin 5.4.0 from the workspace lockfile; `pnpm install` first.
Compiler: Solidity 0.8.30; target EVM Cancun. No proxies or private keys in source.
