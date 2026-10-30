# Deploy PactPay to Sepolia with an existing Foundry keystore

This deploys the mock settlement token and complete financing contract to Ethereum
Sepolia (chain 11155111), then publishes their source and compiler settings on
Etherscan. It does not deploy the Next.js app or enable real-money settlement.

## 1. Confirm your existing account

```sh
cast wallet list
# Set the name of the encrypted account you already created:
export KEYSTORE_ACCOUNT=your-existing-account-name
cast wallet address --account "$KEYSTORE_ACCOUNT"
```

Foundry asks for your keystore password interactively. Never export the private
key, put the password in a script, or paste a recovery phrase into PactPay.
For a keystore outside Foundry's default directory, use `--keystore /absolute/path`
in place of `--account "$KEYSTORE_ACCOUNT"`.

## 2. Configure the deployment

Put the following in your shell or an ignored local environment file. Keep RPC
provider credentials and your Etherscan API key out of Git and NEXT_PUBLIC fields.
Use real public wallet addresses for each role; the values below are placeholders.

```sh
export RPC_URL=https://your-sepolia-rpc
export ETH_RPC_URL="$RPC_URL"
export ETHERSCAN_API_KEY=your-etherscan-api-key
export ALLOW_MOCK_DEPLOYMENT=true
export DEPLOY_CHAIN_ID=11155111
export DEPLOYER_ADDRESS=0xYourKeystoreWalletAddress
export PROTOCOL_ADMIN=0xYourAdministratorAddress
export VERIFIER_ADDRESS=0xYourVerifierAddress
export LISTER_ADDRESS=0xYourListingOperatorAddress
export SETTLER_ADDRESS=0xYourRepaymentOperatorAddress
export PAUSER_ADDRESS=0xYourPauseAuthorityAddress
```

The deploying wallet needs Sepolia ETH for gas. The script deploys **both**
`PactPayFinancing` and `MockSettlementToken`, configures the settlement token and
initializes the listed roles. If PROTOCOL_ADMIN differs from DEPLOYER_ADDRESS,
the bootstrap deployer relinquishes its financing-admin role. The mock token's
minting administrator is PROTOCOL_ADMIN.

```sh
cast chain-id --rpc-url "$RPC_URL"   # must print 11155111
pnpm install --frozen-lockfile
forge build --root packages/contracts
forge test --root packages/contracts
```

## 3. Simulate first, then broadcast and verify

Run from the repository root. ETH_RPC_URL and ETHERSCAN_API_KEY are read from the
environment. Do not supply a raw private key.

```sh
# Simulation only: no transactions sent.
forge script script/Deploy.s.sol:Deploy --root packages/contracts \
  --chain sepolia --account "$KEYSTORE_ACCOUNT" --sender "$DEPLOYER_ADDRESS"

# Deploy both contracts and submit full sources for Etherscan verification.
forge script script/Deploy.s.sol:Deploy --root packages/contracts \
  --chain sepolia --account "$KEYSTORE_ACCOUNT" --sender "$DEPLOYER_ADDRESS" \
  --broadcast --verify --verifier etherscan
```

Foundry submits the Solidity sources, OpenZeppelin dependencies, constructor
arguments and matching pinned compiler/optimizer configuration. Verification makes
the deployed bytecode and source match visible on Etherscan; it is not a security
audit, invoice verification or endorsement.

If broadcasting succeeded but verification is delayed, resume verification without
creating another deployment:

```sh
forge script script/Deploy.s.sol:Deploy --root packages/contracts \
  --chain sepolia --account "$KEYSTORE_ACCOUNT" --sender "$DEPLOYER_ADDRESS" \
  --resume --verify --verifier etherscan
```

For an individual contract, use its constructor argument and the same project:

```sh
forge verify-contract --root packages/contracts --chain sepolia --watch \
  --constructor-args "$(cast abi-encode 'constructor(address)' "$DEPLOYER_ADDRESS")" \
  "$FINANCING_ADDRESS" src/PactPayFinancing.sol:PactPayFinancing

forge verify-contract --root packages/contracts --chain sepolia --watch \
  --constructor-args "$(cast abi-encode 'constructor(address)' "$PROTOCOL_ADMIN")" \
  "$TOKEN_ADDRESS" src/MockSettlementToken.sol:MockSettlementToken
```

Read the actual addresses from the successful broadcast output. Do not use local
Anvil addresses or guess them. The result pages are
`https://sepolia.etherscan.io/address/<address>#code`.

## 4. Export and use the generated manifest

```sh
export BLOCK_CONFIRMATIONS=3
node packages/blockchain/scripts/export-testnet.ts
pnpm web3:generate
```

The exporter checks the successful receipts and writes
`packages/blockchain/deployments/11155111.json`. Archive it with the release.
Configure the application with CHAIN_ID=11155111, server RPC_URL, a browser-safe
NEXT_PUBLIC_RPC_URL, EXPLORER_URL=https://sepolia.etherscan.io, APP_ORIGIN matching
the application URL, and this generated deployment manifest. Server RPC credentials
are not returned to browsers. Run the synchronization worker against the same chain.

Eligible investors also need INVESTOR_ROLE, granted by the contract administrator:

```sh
cast send "$FINANCING_ADDRESS" 'grantRole(bytes32,address)' \
  "$(cast keccak 'INVESTOR_ROLE')" "$INVESTOR_ADDRESS" \
  --rpc-url "$RPC_URL" --account "$ADMIN_KEYSTORE_ACCOUNT"
```

Backend operator scopes are separate from contract roles. An authorized database
operator provisions them with `pnpm admin:grant <wallet> <scope> <reason>`.
Never self-register administrators or treat token minting as real stablecoin funding.

No Sepolia broadcast or Etherscan publication is claimed until you run the commands
with your RPC, keystore and API key and the explorer confirms verification.
