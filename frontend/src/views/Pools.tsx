import { useState } from 'react'
import { parseUnits, type Address, type Hex } from 'viem'

import { createWeightedPool, readDecimals, requireAddress, type PoolSnapshot } from '../chain'
import { EXPLORER, WBNB } from '../config'
import { explain, formatAmount, formatFee, isWbnb, parseAmount, shortAddress } from '../format'
import { TxLinks } from '../ui'
import { useWallet } from '../wallet'

export function PoolsView({
  pools,
  busy,
  onSelect,
  onTrade,
  onLiquidity,
}: {
  pools: PoolSnapshot[]
  busy: boolean
  onSelect: (address: Address) => void
  onTrade: (address: Address) => void
  onLiquidity: (address: Address) => void
}) {
  const [creating, setCreating] = useState(false)
  const [paste, setPaste] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)

  return (
    <section className="sheet wide">
      <header className="sheet-head">
        <div>
          <p className="kicker">Weighted and stable factories</p>
          <h1>Pools</h1>
        </div>
        <button type="button" className="ghost" onClick={() => setCreating((value) => !value)}>
          {creating ? 'All pools' : 'Create weighted pool'}
        </button>
      </header>
      {creating ? (
        <CreateForm
          onCreated={(address) => {
            setCreating(false)
            onLiquidity(address)
          }}
        />
      ) : (
        <>
          <form
            className="paste"
            onSubmit={(event) => {
              event.preventDefault()
              setPasteError(null)
              try {
                onSelect(requireAddress(paste, 'Pool'))
                setPaste('')
              } catch (reason) {
                setPasteError(explain(reason))
              }
            }}
          >
            <input
              value={paste}
              placeholder="Paste a pool address"
              onChange={(event) => setPaste(event.target.value)}
            />
            <button type="submit" className="ghost">
              Load
            </button>
          </form>
          {pasteError ? <p className="error">{pasteError}</p> : null}
          {busy ? <p className="hint">Reading factories…</p> : null}
          {pools.length === 0 && !busy ? <p className="hint">No pools yet. Create one, or paste an address.</p> : null}
          <div className="pool-list">
            {pools.map((pool) => (
              <article key={pool.address} className="pool-row">
                <div>
                  <strong>{pool.symbol}</strong>
                  <a href={`${EXPLORER}/address/${pool.address}`} target="_blank" rel="noreferrer">
                    {shortAddress(pool.address)}
                  </a>
                </div>
                <span>{formatFee(pool.fee)}</span>
                <p>
                  {pool.tokens
                    .map((token) => `${formatAmount(token.poolBalance, token.decimals)} ${token.symbol}`)
                    .join(' · ')}
                  {pool.initialized ? '' : ' · not initialized'}
                </p>
                <div className="row-actions">
                  <button type="button" className="ghost" onClick={() => onTrade(pool.address)}>
                    Trade
                  </button>
                  <button type="button" className="ghost" onClick={() => onLiquidity(pool.address)}>
                    Liquidity
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function CreateForm({ onCreated }: { onCreated: (address: Address) => void }) {
  const wallet = useWallet()
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [tokenA, setTokenA] = useState('')
  const [tokenB, setTokenB] = useState<string>(WBNB)
  const [weightA, setWeightA] = useState('50')
  const [weightB, setWeightB] = useState('50')
  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')
  const [fee, setFee] = useState('0.3')
  const [useNative, setUseNative] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hashes, setHashes] = useState<{ label: string; hash: Hex }[]>([])
  const [created, setCreated] = useState<Address | null>(null)

  async function submit() {
    setError(null)
    setHashes([])
    if (!wallet.address || !wallet.walletClient) {
      try {
        await wallet.connect()
      } catch (reason) {
        setError(explain(reason))
      }
      return
    }
    if (!wallet.chainOk) {
      try {
        await wallet.switchChain()
      } catch (reason) {
        setError(explain(reason))
      }
      return
    }
    try {
      const a = requireAddress(tokenA, 'Token A')
      const b = requireAddress(tokenB, 'Token B')
      if (a.toLowerCase() === b.toLowerCase()) throw new Error('Choose two different tokens')
      const weightLeft = parseUnits(weightA, 16)
      const weightRight = parseUnits(weightB, 16)
      if (weightLeft + weightRight !== 10n ** 18n) throw new Error('Weights must add up to 100%')
      const feeWei = parseUnits(fee, 16)
      const [decimalsA, decimalsB] = await Promise.all([readDecimals(a), readDecimals(b)])
      const parsedA = amountA.trim() === '' ? 0n : parseAmount(amountA, decimalsA)
      const parsedB = amountB.trim() === '' ? 0n : parseAmount(amountB, decimalsB)
      if (parsedA === null || parsedB === null) throw new Error('Initial amounts are not valid')
      setBusy('Creating pool')
      const result = await createWeightedPool(wallet.walletClient, wallet.address, {
        name: name.trim(),
        symbol: symbol.trim(),
        swapFee: feeWei,
        useNative,
        tokens: [
          { address: a, weight: weightLeft, amount: parsedA, decimals: decimalsA },
          { address: b, weight: weightRight, amount: parsedB, decimals: decimalsB },
        ],
        onPhase: (phase) => {
          if (phase === 'create') setBusy('Creating pool')
          else if (phase === 'approve') setBusy('Approving token')
          else if (phase === 'permit') setBusy('Allowing router')
          else setBusy('Adding first liquidity')
        },
      })
      setHashes(result.hashes.map((hash, index) => ({ label: index === 0 ? 'Create' : 'Initialize', hash })))
      setCreated(result.pool)
    } catch (reason) {
      setError(explain(reason))
    } finally {
      setBusy(null)
    }
  }

  const nativeAvailable = isWbnb(tokenA) || isWbnb(tokenB)

  return (
    <form
      className="create"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        Symbol
        <input value={symbol} onChange={(event) => setSymbol(event.target.value)} required />
      </label>
      <label>
        Token A
        <input value={tokenA} onChange={(event) => setTokenA(event.target.value)} placeholder="0x" required />
      </label>
      <label>
        Weight A %
        <input value={weightA} onChange={(event) => setWeightA(event.target.value)} />
      </label>
      <label>
        Token B
        <input value={tokenB} onChange={(event) => setTokenB(event.target.value)} required />
      </label>
      <label>
        Weight B %
        <input value={weightB} onChange={(event) => setWeightB(event.target.value)} />
      </label>
      <label>
        Amount A
        <input value={amountA} placeholder="Optional" onChange={(event) => setAmountA(event.target.value)} />
      </label>
      <label>
        Amount B
        <input value={amountB} placeholder="Optional" onChange={(event) => setAmountB(event.target.value)} />
      </label>
      <label>
        Swap fee %
        <input value={fee} onChange={(event) => setFee(event.target.value)} />
      </label>
      {nativeAvailable ? (
        <label className="check">
          <input type="checkbox" checked={useNative} onChange={(event) => setUseNative(event.target.checked)} />
          Send BNB instead of WBNB
        </label>
      ) : null}
      <button type="submit" className="action" disabled={Boolean(busy)}>
        {busy ?? (wallet.address ? 'Create pool' : 'Connect wallet')}
      </button>
      {error ? <p className="error">{error}</p> : null}
      <TxLinks hashes={hashes} />
      {created ? (
        <button type="button" className="ghost" onClick={() => onCreated(created)}>
          Open {shortAddress(created)}
        </button>
      ) : null}
    </form>
  )
}
