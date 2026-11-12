# Kindling BSC setup

This repository is a Balancer V3 fork. The Kindling deployment gives this fork its own contract addresses on BSC instead of reusing Balancer's deployment or the sender's nonce.

Nothing in this file is a private key. `DEPLOYER_PRIVATE_KEY` stays in `.env`, which is gitignored.

## Why the addresses are namespaced

A first local deploy used Anvil's default account and that account's nonce. Those addresses belong to a public test key, and they change if the nonce changes. They are recorded only as a local proof in `pkg/vault/deployments/anvil-56.json`.

The script in `pkg/vault/script/DeployBalancer.s.sol` fixes that:

1. The public CREATE2 proxy at `0x4e59b44847b379578588920cA78FbF26c0B4956C` deploys `NamespaceDeployer`. The salt is `keccak256("kindling-bsc-7f3a-v1.namespace-deployer")`, and the constructor argument is the deployer address. That deployer owns `NamespaceDeployer`.
2. `NamespaceDeployer` CREATE2-deploys every other top-level contract. Each salt is `keccak256` of `kindling-bsc-7f3a-v1.<name>`, for example `kindling-bsc-7f3a-v1.vault`.
3. The Vault itself is CREATE3 from `VaultFactory`, so its address depends on the factory address and the vault salt, not on a transaction nonce.

The same deployer key and the same `DEPLOY_NAMESPACE` therefore produce the same Vault on BSC Testnet (chain id 97) and BSC mainnet (chain id 56). Router, batch router, buffer router, and composite router addresses differ between those chains because their bytecode includes WBNB, and testnet WBNB is a different contract.

## What gets deployed

`ProtocolAuthorizer` is the bootstrap authorizer. Its owner can perform every action. It is meant to be replaced with `TimelockAuthorizer` before the Vault holds meaningful value.

`NamespaceDeployer` then deploys, in order:

| Contract | Salt name | Notes |
| --- | --- | --- |
| ProtocolAuthorizer | `authorizer` | Owner is `ADMIN`, or the deployer when `ADMIN` is unset. |
| VaultFactory | `vault-factory` | Stores the authorizer, pause window, and bytecode hashes. |
| ProtocolFeeController | `protocol-fee-controller` | Constructed with the predicted Vault address. Initial protocol fees are zero. |
| Vault, VaultAdmin, VaultExtension | `vault` | Factory `create` deploys admin and extension with CREATE2, then the Vault with CREATE3. |
| Router | `router` | Immutable Vault, WBNB, and Permit2. |
| BatchRouter | `batch-router` | Same constructor shape as Router. |
| BufferRouter | `buffer-router` | Same constructor shape as Router. |
| CompositeLiquidityRouter | `composite-liquidity-router` | Same constructor shape as Router. |
| VaultExplorer | `vault-explorer` | Read-only helper bound to this Vault. |
| WeightedPoolFactory | `weighted-pool-factory` | Creates weighted pools for this Vault. |
| StablePoolFactory | `stable-pool-factory` | Creates stable pools for this Vault. |

Fixed deployment parameters:

- Pause window: 4 years, the Vault maximum. It cannot be extended later.
- Buffer period: 180 days.
- Minimum trade amount: `1e6` raw token units.
- Minimum wrap amount: `1e4` raw token units.
- Permit2: `0x000000000022D473030F116dDEE9F6B43aC78BA3` on both BSC networks.
- WBNB mainnet: `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`.
- WBNB testnet: `0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd`.

The Foundry deploy profile compiles with `via_ir`, the Cancun EVM, and `optimizer_runs = 1`. That last setting is what keeps the Vault under BSC's 24,576-byte contract size limit.

## Environment

`.env` at the repository root:

```bash
export BSC_MAINNET_RPC_URL="https://bsc-dataseed.bnbchain.org"
export BSC_TESTNET_RPC_URL="https://bsc-testnet-dataseed.bnbchain.org"
export DEPLOY_NAMESPACE="kindling-bsc-7f3a-v1"
export DEPLOYER_PRIVATE_KEY=0x<64 hex characters, no quotes>
```

`DEPLOYER_PRIVATE_KEY` must be the key for the account that should own the namespace. The value is a single `0x` prefix plus 64 hex characters. Quotes, a second paste, or a truncated copy make Foundry reject it. Do not commit the key.

Foundry reads the RPC names from `pkg/vault/foundry.toml`: `bsc` and `bscTestnet`.

## Broadcast

From `pkg/vault`, after sourcing `.env`:

```bash
source ../../.env
yarn deploy:bsc-testnet
```

That runs:

```bash
FOUNDRY_PROFILE=deploy forge script script/DeployBalancer.s.sol:DeployBalancer \
  --rpc-url bscTestnet --broadcast --slow
```

Mainnet is the same script with `yarn deploy:bsc`. Use testnet until the authorizer and the pause roles are the ones you intend to keep.

The local Anvil run proved the script on chain id 56 at `http://127.0.0.1:8545`. That broadcast used Anvil's default deployer, so its addresses are not the ones below. The script logs the real addresses at the end of a broadcast. Compare `namespaceDeployer` and `vault` with the predictions before using them.

At the gas price seen on BSC Testnet while this was written (about 0.5 gwei), the full broadcast needs about 0.03 tBNB. A 0.0005 tBNB balance is not enough and would stop midway.

## Addresses for the current deployer

These are the CREATE2 addresses for namespace `kindling-bsc-7f3a-v1` and deployer `0xb1B6576Fc620deFfAA09bC902f4866659B18726F`. Router rows are the BSC Testnet versions. They are predictions until the broadcast succeeds. The frontend reads the same list from `frontend/src/config.ts`.

| Contract | Address |
| --- | --- |
| Deployer | `0xb1B6576Fc620deFfAA09bC902f4866659B18726F` |
| NamespaceDeployer | `0xbb27bD963a736e8f4fc08c8384f5fEb87394C946` |
| ProtocolAuthorizer | `0xF0142311C2d168A5BfCB33E4C883737619c6E5E2` |
| VaultFactory | `0x72EB085EdDEC1187113c975a0b7893F4C4C1CB85` |
| Vault | `0x4567c125083D954C333aF0b65033b8A671eA7663` |
| VaultAdmin | `0x0e816f71a78332E6a80555FEB49bf9aDb0b8157B` |
| VaultExtension | `0xdC95Aa25C59484f84B0f9B079Be532e911Bf9520` |
| ProtocolFeeController | `0xaD74eA8e27Db4C80F20f965831f730d304e981E7` |
| Router | `0xcDc838c0D9fe7c82ecCa170B655ed88e3e9e1169` |
| BatchRouter | `0xE5Ee35c386504f362dC2db1ef85c2af474767d6E` |
| BufferRouter | `0xfeBbc3DEc07BC7d777D0a63f5243F95155950536` |
| CompositeLiquidityRouter | `0x8BA88ab480A12e65d0d169f61Aeeffe2A5A45b29` |
| VaultExplorer | `0x04BcCe0AcAE8d1F90Ed0AC9E7E9B1eb694C5D241` |
| WeightedPoolFactory | `0x4e993422ab439782bd4d7b5E80773BCcF2459381` |
| StablePoolFactory | `0x00f639BdC01320a17f9B5C434f12Bb9934eB19D4` |

A different deployer key produces a different NamespaceDeployer and therefore a different Vault. Changing `DEPLOY_NAMESPACE` also changes every salt.

## Frontend

`frontend/` is a Vite app aimed at BSC Testnet. It lists pools from the weighted and stable factories, quotes and sends swaps through the Router, and adds or removes liquidity with Permit2 approvals. Swaps pull tokens through Permit2, so the wallet approves Permit2 and then Permit2's allowance for the Router.

```bash
cd frontend
npm install
npm run dev
```

The app is served at `http://127.0.0.1:5173`. Connect a wallet on chain id 97. The page reports that the Vault has no bytecode until the broadcast above is confirmed on testnet.
