import {
  getAddress,
  isAddress,
  parseEventLogs,
  type Address,
  type Hex,
  type WalletClient,
} from 'viem'
import { bscTestnet } from 'viem/chains'

import { erc20Abi, factoryAbi, permit2Abi, routerAbi, vaultAbi, weightedFactoryAbi } from './abi'
import { PERMIT2, WBNB, ZERO, contracts, publicClient } from './config'

export type SigningClient = Pick<WalletClient, 'writeContract'>

export type PoolToken = {
  address: Address
  symbol: string
  name: string
  decimals: number
  poolBalance: bigint
  walletBalance: bigint | null
}

export type PoolSnapshot = {
  address: Address
  name: string
  symbol: string
  fee: bigint
  initialized: boolean
  totalSupply: bigint
  walletBpt: bigint | null
  tokens: PoolToken[]
}

const MAX_UINT160 = (1n << 160n) - 1n
const MAX_UINT256 = (1n << 256n) - 1n

export async function vaultIsDeployed(): Promise<boolean> {
  const code = await publicClient.getBytecode({ address: contracts.vault })
  return Boolean(code && code !== '0x')
}

export async function discoverPools(): Promise<Address[]> {
  const lists = await Promise.all(
    [contracts.weightedPoolFactory, contracts.stablePoolFactory].map(async (factory) => {
      try {
        return await publicClient.readContract({
          address: factory,
          abi: factoryAbi,
          functionName: 'getPools',
        })
      } catch {
        return [] as readonly Address[]
      }
    }),
  )
  const unique = new Map<string, Address>()
  for (const list of lists) {
    for (const pool of list) unique.set(pool.toLowerCase(), pool)
  }
  return [...unique.values()]
}

function rawBalances(info: unknown): bigint[] {
  if (Array.isArray(info) && Array.isArray(info[2])) {
    return info[2] as bigint[]
  }
  if (info && typeof info === 'object' && 'balancesRaw' in info) {
    return [...(info as { balancesRaw: readonly bigint[] }).balancesRaw]
  }
  return []
}

async function readTokenMeta(token: Address, owner?: Address): Promise<Omit<PoolToken, 'poolBalance'>> {
  const contractsToRead = [
    { address: token, abi: erc20Abi, functionName: 'symbol' as const },
    { address: token, abi: erc20Abi, functionName: 'decimals' as const },
    { address: token, abi: erc20Abi, functionName: 'name' as const },
  ]
  const results = await publicClient.multicall({ contracts: contractsToRead, allowFailure: true })
  const symbol = results[0]?.status === 'success' ? String(results[0].result) : token.slice(0, 6)
  const decimals = results[1]?.status === 'success' ? Number(results[1].result) : 18
  const name = results[2]?.status === 'success' ? String(results[2].result) : symbol
  let walletBalance: bigint | null = null
  if (owner) {
    try {
      walletBalance = await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [owner],
      })
    } catch {
      walletBalance = null
    }
  }
  return { address: token, symbol, name, decimals, walletBalance }
}

export async function loadPool(pool: Address, owner?: Address): Promise<PoolSnapshot> {
  const address = getAddress(pool)
  const [tokens, initialized, fee, info, meta] = await Promise.all([
    publicClient.readContract({
      address: contracts.vault,
      abi: vaultAbi,
      functionName: 'getPoolTokens',
      args: [address],
    }),
    publicClient.readContract({
      address: contracts.vault,
      abi: vaultAbi,
      functionName: 'isPoolInitialized',
      args: [address],
    }),
    publicClient.readContract({
      address: contracts.vault,
      abi: vaultAbi,
      functionName: 'getStaticSwapFeePercentage',
      args: [address],
    }),
    publicClient.readContract({
      address: contracts.vault,
      abi: vaultAbi,
      functionName: 'getPoolTokenInfo',
      args: [address],
    }),
    publicClient.multicall({
      allowFailure: true,
      contracts: [
        { address, abi: erc20Abi, functionName: 'name' },
        { address, abi: erc20Abi, functionName: 'symbol' },
        { address, abi: erc20Abi, functionName: 'totalSupply' },
        { address, abi: erc20Abi, functionName: 'balanceOf', args: [owner ?? ZERO] },
      ],
    }),
  ])

  const balances = rawBalances(info)
  const tokenMeta = await Promise.all(tokens.map((token) => readTokenMeta(token, owner)))
  const name = meta[0]?.status === 'success' ? String(meta[0].result) : 'Pool'
  const symbol = meta[1]?.status === 'success' ? String(meta[1].result) : shortFallback(address)
  const totalSupply = meta[2]?.status === 'success' ? (meta[2].result as bigint) : 0n
  const walletBpt = owner && meta[3]?.status === 'success' ? meta[3].result : null

  return {
    address,
    name,
    symbol,
    fee,
    initialized,
    totalSupply,
    walletBpt,
    tokens: tokenMeta.map((token, index) => ({
      ...token,
      poolBalance: balances[index] ?? 0n,
    })),
  }
}

function shortFallback(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function quoteSender(owner: Address | null): Address {
  return owner ?? '0x0000000000000000000000000000000000000001'
}

export async function quoteExactIn(
  pool: Address,
  tokenIn: Address,
  tokenOut: Address,
  amount: bigint,
  sender: Address,
): Promise<bigint> {
  const { result } = await publicClient.simulateContract({
    address: contracts.router,
    abi: routerAbi,
    functionName: 'querySwapSingleTokenExactIn',
    args: [pool, tokenIn, tokenOut, amount, sender, '0x'],
    account: sender,
  })
  return result
}

export async function quoteAdd(
  pool: Address,
  amounts: bigint[],
  sender: Address,
): Promise<bigint> {
  const { result } = await publicClient.simulateContract({
    address: contracts.router,
    abi: routerAbi,
    functionName: 'queryAddLiquidityUnbalanced',
    args: [pool, amounts, sender, '0x'],
    account: sender,
  })
  return result
}

export async function quoteRemove(
  pool: Address,
  bptIn: bigint,
  sender: Address,
): Promise<readonly bigint[]> {
  const { result } = await publicClient.simulateContract({
    address: contracts.router,
    abi: routerAbi,
    functionName: 'queryRemoveLiquidityProportional',
    args: [pool, bptIn, sender, '0x'],
    account: sender,
  })
  return result
}

async function wait(hash: Hex): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    throw new Error('Transaction reverted')
  }
}

export async function ensureRouterAllowance(
  client: SigningClient,
  owner: Address,
  token: Address,
  amount: bigint,
  onPhase: (phase: 'approve' | 'permit') => void,
): Promise<Hex[]> {
  const hashes: Hex[] = []
  const erc20Allowance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, PERMIT2],
  })
  if (erc20Allowance < amount) {
    onPhase('approve')
    const hash = await client.writeContract({
      account: owner,
      chain: bscTestnet,
      address: token,
      abi: erc20Abi,
      functionName: 'approve',
      args: [PERMIT2, MAX_UINT256],
    })
    hashes.push(hash)
    await wait(hash)
  }

  const [allowed, expiration] = await publicClient.readContract({
    address: PERMIT2,
    abi: permit2Abi,
    functionName: 'allowance',
    args: [owner, token, contracts.router],
  })
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (allowed < amount || expiration <= now + 120n) {
    onPhase('permit')
    const nextExpiration = now + 60n * 60n * 24n * 30n
    const hash = await client.writeContract({
      account: owner,
      chain: bscTestnet,
      address: PERMIT2,
      abi: permit2Abi,
      functionName: 'approve',
      args: [token, contracts.router, MAX_UINT160, Number(nextExpiration)],
    })
    hashes.push(hash)
    await wait(hash)
  }
  return hashes
}

export async function swapExactIn(
  client: SigningClient,
  owner: Address,
  args: {
    pool: Address
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    minAmountOut: bigint
    wethIsEth: boolean
    onPhase: (phase: 'approve' | 'permit' | 'swap') => void
  },
): Promise<Hex> {
  if (!(args.wethIsEth && isSame(args.tokenIn, WBNB))) {
    await ensureRouterAllowance(client, owner, args.tokenIn, args.amountIn, args.onPhase)
  }
  args.onPhase('swap')
  const hash = await client.writeContract({
    account: owner,
    chain: bscTestnet,
    address: contracts.router,
    abi: routerAbi,
    functionName: 'swapSingleTokenExactIn',
    args: [
      args.pool,
      args.tokenIn,
      args.tokenOut,
      args.amountIn,
      args.minAmountOut,
      BigInt(Math.floor(Date.now() / 1000) + 1_200),
      args.wethIsEth,
      '0x',
    ],
    value: args.wethIsEth && isSame(args.tokenIn, WBNB) ? args.amountIn : 0n,
  })
  await wait(hash)
  return hash
}

export async function addUnbalanced(
  client: SigningClient,
  owner: Address,
  args: {
    pool: Address
    tokens: Address[]
    amounts: bigint[]
    minBpt: bigint
    wethIsEth: boolean
    onPhase: (phase: 'approve' | 'permit' | 'swap') => void
  },
): Promise<Hex> {
  for (let index = 0; index < args.tokens.length; index += 1) {
    const amount = args.amounts[index] ?? 0n
    const token = args.tokens[index]
    if (!token || amount === 0n) continue
    if (args.wethIsEth && isSame(token, WBNB)) continue
    await ensureRouterAllowance(client, owner, token, amount, args.onPhase)
  }
  args.onPhase('swap')
  const value = args.wethIsEth
    ? args.amounts.reduce((sum, amount, index) => {
        const token = args.tokens[index]
        return token && isSame(token, WBNB) ? sum + amount : sum
      }, 0n)
    : 0n
  const hash = await client.writeContract({
    account: owner,
    chain: bscTestnet,
    address: contracts.router,
    abi: routerAbi,
    functionName: 'addLiquidityUnbalanced',
    args: [args.pool, args.amounts, args.minBpt, args.wethIsEth, '0x'],
    value,
  })
  await wait(hash)
  return hash
}

export async function removeProportional(
  client: SigningClient,
  owner: Address,
  args: {
    pool: Address
    bptIn: bigint
    minAmounts: bigint[]
    wethIsEth: boolean
    onPhase: (phase: 'approve' | 'permit' | 'swap') => void
  },
): Promise<Hex> {
  await ensureRouterAllowance(client, owner, args.pool, args.bptIn, args.onPhase)
  args.onPhase('swap')
  const hash = await client.writeContract({
    account: owner,
    chain: bscTestnet,
    address: contracts.router,
    abi: routerAbi,
    functionName: 'removeLiquidityProportional',
    args: [args.pool, args.bptIn, args.minAmounts, args.wethIsEth, '0x'],
  })
  await wait(hash)
  return hash
}

export function requireAddress(value: string, label: string): Address {
  const trimmed = value.trim()
  if (!isAddress(trimmed)) {
    throw new Error(`${label} is not an address`)
  }
  return getAddress(trimmed)
}

export async function createWeightedPool(
  client: SigningClient,
  owner: Address,
  args: {
    name: string
    symbol: string
    tokens: { address: Address; weight: bigint; amount: bigint; decimals: number }[]
    swapFee: bigint
    useNative: boolean
    onPhase: (phase: 'create' | 'approve' | 'permit' | 'initialize') => void
  },
): Promise<{ pool: Address; hashes: Hex[] }> {
  const sorted = [...args.tokens].sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1))
  const amounts = sorted.map((token) => token.amount)
  const willInitialize = amounts.some((amount) => amount > 0n)
  if (willInitialize && amounts.some((amount) => amount === 0n)) {
    throw new Error('Initial liquidity needs an amount for every token')
  }
  const salt = `0x${[...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, '0')).join('')}` as Hex
  args.onPhase('create')
  const createHash = await client.writeContract({
    account: owner,
    chain: bscTestnet,
    address: contracts.weightedPoolFactory,
    abi: weightedFactoryAbi,
    functionName: 'create',
    args: [
      args.name,
      args.symbol,
      sorted.map((token) => ({
        token: token.address,
        tokenType: 0,
        rateProvider: ZERO,
        paysYieldFees: false,
      })),
      sorted.map((token) => token.weight),
      { pauseManager: ZERO, swapFeeManager: ZERO, poolCreator: ZERO },
      args.swapFee,
      ZERO,
      false,
      false,
      salt,
    ],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash })
  if (receipt.status !== 'success') throw new Error('Pool creation reverted')
  const created = parseEventLogs({
    abi: weightedFactoryAbi,
    logs: receipt.logs,
    eventName: 'PoolCreated',
  })
  const pool = created[0]?.args.pool
  if (!pool) throw new Error('Pool address was not in the receipt')
  const hashes: Hex[] = [createHash]
  if (willInitialize) {
    for (const token of sorted) {
      if (args.useNative && isSame(token.address, WBNB)) continue
      const approvalHashes = await ensureRouterAllowance(client, owner, token.address, token.amount, (phase) => {
        args.onPhase(phase)
      })
      hashes.push(...approvalHashes)
    }
    args.onPhase('initialize')
    const value =
      args.useNative
        ? sorted.reduce((sum, token) => (isSame(token.address, WBNB) ? sum + token.amount : sum), 0n)
        : 0n
    const initHash = await client.writeContract({
      account: owner,
      chain: bscTestnet,
      address: contracts.router,
      abi: routerAbi,
      functionName: 'initialize',
      args: [pool, sorted.map((token) => token.address), amounts, 0n, args.useNative, '0x'],
      value,
    })
    await wait(initHash)
    hashes.push(initHash)
  }
  return { pool, hashes }
}

export async function readDecimals(token: Address): Promise<number> {
  try {
    return await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'decimals',
    })
  } catch {
    return 18
  }
}

function isSame(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}
