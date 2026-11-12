import { parseAbi } from 'viem'

export const erc20Abi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
])

export const permit2Abi = parseAbi([
  'function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
])

export const vaultAbi = parseAbi([
  'function getPoolTokens(address pool) view returns (address[])',
  'function isPoolInitialized(address pool) view returns (bool)',
  'function getStaticSwapFeePercentage(address pool) view returns (uint256)',
  'function getPoolTokenInfo(address pool) view returns (address[] tokens, (uint8 tokenType, address rateProvider, bool paysYieldFees)[] tokenInfo, uint256[] balancesRaw, uint256[] lastBalancesLiveScaled18)',
])

export const factoryAbi = parseAbi([
  'function getPools() view returns (address[])',
  'function getPoolCount() view returns (uint256)',
  'event PoolCreated(address indexed pool)',
])

export const weightedFactoryAbi = parseAbi([
  'function create(string name, string symbol, (address token, uint8 tokenType, address rateProvider, bool paysYieldFees)[] tokens, uint256[] normalizedWeights, (address pauseManager, address swapFeeManager, address poolCreator) roleAccounts, uint256 swapFeePercentage, address poolHooksContract, bool enableDonation, bool disableUnbalancedLiquidity, bytes32 salt) returns (address pool)',
  'event PoolCreated(address indexed pool)',
])

export const routerAbi = parseAbi([
  'function querySwapSingleTokenExactIn(address pool, address tokenIn, address tokenOut, uint256 exactAmountIn, address sender, bytes userData) returns (uint256 amountOut)',
  'function swapSingleTokenExactIn(address pool, address tokenIn, address tokenOut, uint256 exactAmountIn, uint256 minAmountOut, uint256 deadline, bool wethIsEth, bytes userData) payable returns (uint256 amountOut)',
  'function queryAddLiquidityUnbalanced(address pool, uint256[] exactAmountsIn, address sender, bytes userData) returns (uint256 bptAmountOut)',
  'function addLiquidityUnbalanced(address pool, uint256[] exactAmountsIn, uint256 minBptAmountOut, bool wethIsEth, bytes userData) payable returns (uint256 bptAmountOut)',
  'function queryRemoveLiquidityProportional(address pool, uint256 exactBptAmountIn, address sender, bytes userData) returns (uint256[] amountsOut)',
  'function removeLiquidityProportional(address pool, uint256 exactBptAmountIn, uint256[] minAmountsOut, bool wethIsEth, bytes userData) payable returns (uint256[] amountsOut)',
  'function initialize(address pool, address[] tokens, uint256[] exactAmountsIn, uint256 minBptAmountOut, bool wethIsEth, bytes userData) payable returns (uint256 bptAmountOut)',
])
