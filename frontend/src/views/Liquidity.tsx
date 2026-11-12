import { useEffect, useState } from 'react'
import type { Address, Hex } from 'viem'

import { addUnbalanced, quoteAdd, quoteRemove, quoteSender, removeProportional, type PoolSnapshot } from '../chain'
import { applySlippage, explain, formatAmount, isWbnb, parseAmount } from '../format'
import { PoolSelect, TxLinks } from '../ui'
import { useWallet } from '../wallet'

type Mode = 'add' | 'remove'

export function LiquidityView({
  pools,
  selected,
  onSelect,
}: {
  pools: PoolSnapshot[]
  selected: PoolSnapshot | null
  onSelect: (address: Address) => void
}) {
  const wallet = useWallet()
  const [mode, setMode] = useState<Mode>('add')
  const [amounts, setAmounts] = useState<string[]>([])
  const [bptAmount, setBptAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState(50)
  const [useNative, setUseNative] = useState(false)
  const [quote, setQuote] = useState<bigint | null>(null)
  const [outs, setOuts] = useState<readonly bigint[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hashes, setHashes] = useState<{ label: string; hash: Hex }[]>([])

  const tokens = selected?.tokens ?? []
  const hasWbnb = tokens.some((token) => isWbnb(token.address))

  useEffect(() => {
    setAmounts(tokens.map(() => ''))
    setBptAmount('')
    setQuote(null)
    setOuts(null)
    setError(null)
    setHashes([])
  }, [selected?.address, tokens.length])

  useEffect(() => {
    if (!selected) return
    let cancel = false
      const timer = window.setTimeout(() => {
      const sender = quoteSender(wallet.address)
      if (mode === 'add') {
        if (amounts.some((value, index) => value.trim() !== '' && parseAmount(value, tokens[index]?.decimals ?? 18) === null)) {
          setQuote(null)
          return
        }
        const parsed = tokens.map((token, index) => parseAmount(amounts[index] ?? '', token.decimals) ?? 0n)
        if (parsed.every((amount) => amount === 0n)) {
          setQuote(null)
          return
        }
        quoteAdd(selected.address, parsed, sender)
          .then((result) => {
            if (!cancel) setQuote(result)
          })
          .catch((reason: unknown) => {
            if (!cancel) {
              setQuote(null)
              setError(explain(reason))
            }
          })
      } else {
        const parsed = parseAmount(bptAmount, 18)
        if (parsed === null || parsed === 0n) {
          setOuts(null)
          return
        }
        quoteRemove(selected.address, parsed, sender)
          .then((result) => {
            if (!cancel) setOuts(result)
          })
          .catch((reason: unknown) => {
            if (!cancel) {
              setOuts(null)
              setError(explain(reason))
            }
          })
      }
    }, 320)
    return () => {
      cancel = true
      window.clearTimeout(timer)
    }
  }, [amounts, bptAmount, mode, selected, tokens, wallet.address])

  async function prepareWallet(): Promise<boolean> {
    if (!wallet.address) {
      await wallet.connect()
      return false
    }
    if (!wallet.chainOk) {
      await wallet.switchChain()
      return false
    }
    return Boolean(wallet.walletClient)
  }

  async function submit() {
    setError(null)
    setHashes([])
    if (!selected) return
    try {
      const ready = await prepareWallet()
      if (!ready || !wallet.address || !wallet.walletClient) return
      if (mode === 'add') {
        if (quote === null) return
        const parsed = tokens.map((token, index) => parseAmount(amounts[index] ?? '', token.decimals) ?? 0n)
        setBusy('Adding liquidity')
        const hash = await addUnbalanced(wallet.walletClient, wallet.address, {
          pool: selected.address,
          tokens: tokens.map((token) => token.address),
          amounts: parsed,
          minBpt: applySlippage(quote, slippageBps),
          wethIsEth: useNative,
          onPhase: (phase) => setBusy(phase === 'swap' ? 'Adding liquidity' : phase === 'approve' ? 'Approving token' : 'Allowing router'),
        })
        setHashes([{ label: 'Liquidity added', hash }])
        setAmounts(tokens.map(() => ''))
      } else {
        const parsed = parseAmount(bptAmount, 18)
        if (parsed === null || outs === null) return
        setBusy('Removing liquidity')
        const hash = await removeProportional(wallet.walletClient, wallet.address, {
          pool: selected.address,
          bptIn: parsed,
          minAmounts: outs.map((amount) => applySlippage(amount, slippageBps)),
          wethIsEth: useNative,
          onPhase: (phase) => setBusy(phase === 'swap' ? 'Removing liquidity' : phase === 'approve' ? 'Approving pool token' : 'Allowing router'),
        })
        setHashes([{ label: 'Liquidity removed', hash }])
        setBptAmount('')
      }
      onSelect(selected.address)
    } catch (reason) {
      setError(explain(reason))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="sheet">
      <header className="sheet-head">
        <div>
          <p className="kicker">{mode === 'add' ? 'Unbalanced deposit' : 'Proportional withdrawal'}</p>
          <h1>Liquidity</h1>
        </div>
        <div className="seg" role="tablist">
          <button type="button" className={mode === 'add' ? 'on' : ''} onClick={() => setMode('add')}>
            Add
          </button>
          <button type="button" className={mode === 'remove' ? 'on' : ''} onClick={() => setMode('remove')}>
            Remove
          </button>
        </div>
      </header>
      <PoolSelect pools={pools} value={selected?.address ?? ''} onChange={onSelect} />
      {selected && !selected.initialized ? <p className="hint">This pool is not initialized yet.</p> : null}
      {mode === 'add'
        ? tokens.map((token, index) => (
            <label key={token.address} className="amount-well">
              <span>{token.symbol}</span>
              <div className="amount-line">
                <input
                  inputMode="decimal"
                  placeholder="0"
                  value={amounts[index] ?? ''}
                  onChange={(event) => {
                    const next = event.target.value
                    if (next !== '' && !/^\d*\.?\d*$/.test(next)) return
                    setAmounts((current) => current.map((value, valueIndex) => (valueIndex === index ? next : value)))
                    setError(null)
                  }}
                />
              </div>
              <span className="hint">
                Pool {formatAmount(token.poolBalance, token.decimals)}
                {token.walletBalance !== null ? ` · wallet ${formatAmount(token.walletBalance, token.decimals)}` : ''}
              </span>
            </label>
          ))
        : (
            <label className="amount-well">
              <span>{selected?.symbol ?? 'BPT'}</span>
              <div className="amount-line">
                <input
                  inputMode="decimal"
                  placeholder="0"
                  value={bptAmount}
                  onChange={(event) => {
                    const next = event.target.value
                    if (next === '' || /^\d*\.?\d*$/.test(next)) setBptAmount(next)
                  }}
                />
              </div>
              <button
                type="button"
                className="max"
                onClick={() => {
                  if (selected?.walletBpt) setBptAmount(formatAmount(selected.walletBpt, 18, 18))
                }}
              >
                Balance {selected?.walletBpt !== null && selected?.walletBpt !== undefined ? formatAmount(selected.walletBpt, 18) : '—'}
              </button>
            </label>
          )}
      {mode === 'add' && quote !== null ? <p className="hint">You receive about {formatAmount(quote, 18)} pool tokens</p> : null}
      {mode === 'remove' && outs ? (
        <p className="hint">
          {tokens.map((token, index) => `${formatAmount(outs[index] ?? 0n, token.decimals)} ${token.symbol}`).join(' · ')}
        </p>
      ) : null}
      {hasWbnb ? (
        <label className="check">
          <input type="checkbox" checked={useNative} onChange={(event) => setUseNative(event.target.checked)} />
          Use BNB for WBNB
        </label>
      ) : null}
      <div className="meta">
        <span>Slippage applies to the minimum you accept</span>
        <label>
          Slippage
          <select value={slippageBps} onChange={(event) => setSlippageBps(Number(event.target.value))}>
            <option value={10}>0.1%</option>
            <option value={50}>0.5%</option>
            <option value={100}>1%</option>
          </select>
        </label>
      </div>
      <button type="button" className="action" disabled={Boolean(busy) || !selected} onClick={() => void submit()}>
        {busy ?? (wallet.address ? (mode === 'add' ? 'Add liquidity' : 'Remove liquidity') : 'Connect wallet')}
      </button>
      {error ? <p className="error">{error}</p> : null}
      <TxLinks hashes={hashes} />
    </section>
  )
}
