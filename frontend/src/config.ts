import { fallback, http, createPublicClient } from 'viem'
import { bscTestnet } from 'viem/chains'

/** CREATE2 namespace from DeployBalancer. The same deployer and namespace keep the vault address stable. */
export const NAMESPACE = 'kindling-bsc-7f3a-v1'

/** BSC testnet WBNB. Router bytecode includes this address, so router addresses differ from BSC mainnet. */
export const WBNB = '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd' as const

export const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const

export const ZERO = '0x0000000000000000000000000000000000000000' as const

export const EXPLORER = 'https://testnet.bscscan.com'

/** Ethereum address that owns this namespace. Vault CREATE2 is derived from this key. */
export const DEPLOYER = '0xb1B6576Fc620deFfAA09bC902f4866659B18726F' as const

/**
 * kindling-bsc-7f3a-v1 addresses for DEPLOYER, not Anvil's default key.
 * Vault, authorizer, and factories stay the same on BSC testnet and mainnet.
 * Routers are the testnet addresses because their bytecode includes testnet WBNB.
 */
export const contracts = {
  namespaceDeployer: '0xbb27bD963a736e8f4fc08c8384f5fEb87394C946',
  authorizer: '0xF0142311C2d168A5BfCB33E4C883737619c6E5E2',
  vaultFactory: '0x72EB085EdDEC1187113c975a0b7893F4C4C1CB85',
  vault: '0x4567c125083D954C333aF0b65033b8A671eA7663',
  vaultAdmin: '0x0e816f71a78332E6a80555FEB49bf9aDb0b8157B',
  vaultExtension: '0xdC95Aa25C59484f84B0f9B079Be532e911Bf9520',
  protocolFeeController: '0xaD74eA8e27Db4C80F20f965831f730d304e981E7',
  router: '0xcDc838c0D9fe7c82ecCa170B655ed88e3e9e1169',
  batchRouter: '0xE5Ee35c386504f362dC2db1ef85c2af474767d6E',
  bufferRouter: '0xfeBbc3DEc07BC7d777D0a63f5243F95155950536',
  compositeLiquidityRouter: '0x8BA88ab480A12e65d0d169f61Aeeffe2A5A45b29',
  vaultExplorer: '0x04BcCe0AcAE8d1F90Ed0AC9E7E9B1eb694C5D241',
  weightedPoolFactory: '0x4e993422ab439782bd4d7b5E80773BCcF2459381',
  stablePoolFactory: '0x00f639BdC01320a17f9B5C434f12Bb9934eB19D4',
} as const

const rpcFromEnv = import.meta.env.VITE_BSC_TESTNET_RPC

export const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: fallback([
    http(rpcFromEnv || 'https://bsc-testnet.publicnode.com'),
    http('https://bsc-testnet-dataseed.bnbchain.org'),
  ]),
})

export const CHAIN_ID = bscTestnet.id
