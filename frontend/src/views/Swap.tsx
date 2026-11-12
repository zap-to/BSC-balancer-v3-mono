import { useEffect, useState } from 'react'
import type { Address, Hex } from 'viem'

import { quoteExactIn, quoteSender, swapExactIn, type PoolSnapshot } from '../chain'
import { applySlippage, explain, formatAmount, isWbnb, parseAmount } from '../format'
import { useWallet } from '../wallet'
import { PoolSelect, TxLinks } from '../ui'

const SLIPPAGES = [10, 50, 100]

export function SwapView({
  pools,
  selected,
  onSelect,
}: {
  pools: PoolSnapshot[]
  selected: PoolSnapshot | null
  onSelect: (address: Address) => void
}) {
  const wallet = useWallet()
  const [inIndex, setInIndex] = useState(0)
  const [outIndex, setOutIndex] = useState(1)
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState(50)
  const [useNative, setUseNative] = useState(false)
  const [quote, setQuote] = useState<bigint | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hashes, setHashes] = useState<{ label: string; hash: Hex }[]>([])

  const tokens = selected?.tokens ?? []
  const tokenIn = tokens[inIndex]
  const tokenOut = tokens[outIndex]
  const involvesWbnb = tokens.some((token) => isWbnb(token.address))

  useEffect(() => {
    setInIndex(0)
    setOutIndex(tokens.length > 1 ? 1 : 0)
    setAmount('')
    setQuote(null)
    setError(null)
    setHashes([])
  }, [selected?.address, tokens.length])

  useEffect(() => {
    if (!selected || !tokenIn || !tokenOut || tokenIn.address === tokenOut.address) {
      setQuote(null)
      return
    }
    const parsed = parseAmount(amount, tokenIn.decimals)
    if (parsed === null || parsed === 0n) {
      setQuote(null)
      return
    }
    let cancel = false
    const timer = window.setTimeout(() => {
      setQuoting(true)
      setError(null)
      quoteExactIn(selected.address, tokenIn.address, tokenOut.address, parsed, quoteSender(wallet.address))
        .then((result) => {
          if (!cancel) setQuote(result)
        })
        .catch((reason: unknown) => {
          if (!cancel) {
            setQuote(null)
            setError(explain(reason))
          }
        })
        .finally(() => {
          if (!cancel) setQuoting(false)
        })
    }, 320)
    return () => {
      cancel = true
      window.clearTimeout(timer)
    }
  }, [amount, selected, tokenIn, tokenOut, wallet.address])

  function flip() {
    setInIndex(outIndex)
    setOutIndex(inIndex)
    setAmount('')
    setQuote(null)
  }

  async function submit() {
    setError(null)
    setHashes([])
    if (!wallet.address) {
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
    if (!selected || !tokenIn || !tokenOut || !wallet.walletClient || quote === null) return
    const parsed = parseAmount(amount, tokenIn.decimals)
    if (parsed === null || parsed === 0n) return
    const payNative = useNative && isWbnb(tokenIn.address)
    try {
      setBusy('Submitting')
      const hash = await swapExactIn(wallet.walletClient, wallet.address, {
        pool: selected.address,
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountIn: parsed,
        minAmountOut: applySlippage(quote, slippageBps),
        wethIsEth: payNative || (useNative && isWbnb(tokenOut.address)),
        onPhase: (phase) => {
          if (phase === 'approve') setBusy('Approving token')
          else if (phase === 'permit') setBusy('Allowing router')
          else setBusy('Swapping')
        },
      })
      setHashes([{ label: 'Swap confirmed', hash }])
      setAmount('')
      setQuote(null)
      onSelect(selected.address)
    } catch (reason) {
      setError(explain(reason))
    } finally {
      setBusy(null)
    }
  }

  const parsed = tokenIn ? parseAmount(amount, tokenIn.decimals) : null
  const minOut = quote === null ? null : applySlippage(quote, slippageBps)
  const buttonLabel = buttonText({
    busy,
    connected: Boolean(wallet.address),
    chainOk: wallet.chainOk,
    hasPool: Boolean(selected),
    quoting,
    ready: parsed !== null && parsed > 0n && quote !== null,
  })

  return (
    <section className="sheet">
      <header className="sheet-head">
        <div>
          <p className="kicker">Exact in</p>
          <h1>Swap</h1>
        </div>
      </header>
      <PoolSelect pools={pools} value={selected?.address ?? ''} onChange={onSelect} />
      <label className="amount-well">
        <span>You pay</span>
        <div className="amount-line">
          <input
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(event) => {
              const next = event.target.value
              if (next === '' || /^\d*\.?\d*$/.test(next)) setAmount(next)
            }}
          />
          <TokenPick
            tokens={tokens}
            index={inIndex}
            onChange={(index) => {
              if (index === outIndex) setOutIndex(inIndex)
              setInIndex(index)
            }}
          />
        </div>
        {tokenIn?.walletBalance !== null && tokenIn?.walletBalance !== undefined ? (
          <button
            type="button"
            className="max"
            onClick={() => {
              const balance = tokenIn.walletBalance ?? 0n
              const spend = useNative && isWbnb(tokenIn.address) && balance > 2_000_000_000_000_000n
                ? balance - 2_000_000_000_000_000n
                : balance
              setAmount(formatAmount(spend, tokenIn.decimals, tokenIn.decimals))
            }}
          >
            Balance {formatAmount(tokenIn.walletBalance, tokenIn.decimals)}
          </button>
        ) : (
          <span className="hint">Balance appears after you connect</span>
        )}
      </label>
      <button type="button" className="flip" onClick={flip} aria-label="Flip tokens">
        <span />
      </button>
      <div className="amount-well read">
        <span>You receive</span>
        <div className="amount-line">
          <output>{quote === null ? '0' : formatAmount(quote, tokenOut?.decimals ?? 18)}</output>
          <TokenPick
            tokens={tokens}
            index={outIndex}
            onChange={(index) => {
              if (index === inIndex) setInIndex(outIndex)
              setOutIndex(index)
            }}
          />
        </div>
      </div>
      {involvesWbnb ? (
        <label className="check">
          <input
            type="checkbox"
            checked={useNative}
            onChange={(event) => setUseNative(event.target.checked)}
          />
          Use BNB for WBNB
        </label>
      ) : null}
      <div className="meta">
        <span>{quoting ? 'Quoting…' : minOut !== null && tokenOut ? `Min received ${formatAmount(minOut, tokenOut.decimals)} ${tokenOut.symbol}` : 'Quote updates as you type'}</span>
        <label>
          Slippage
          <select value={slippageBps} onChange={(event) => setSlippageBps(Number(event.target.value))}>
            {SLIPPAGES.map((bps) => (
              <option key={bps} value={bps}>
                {bps / 100}%
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" className="action" disabled={Boolean(busy)} onClick={() => void submit()}>
        {buttonLabel}
      </button>
      {error ? <p className="error">{error}</p> : null}
      <TxLinks hashes={hashes} />
    </section>
  )
}

function TokenPick({
  tokens,
  index,
  onChange,
}: {
  tokens: PoolSnapshot['tokens']
  index: number
  onChange: (index: number) => void
}) {
  if (tokens.length === 0) {
    return <span className="token-pill">Token</span>
  }
  return (
    <select className="token-pill" value={index} onChange={(event) => onChange(Number(event.target.value))}>
      {tokens.map((token, tokenIndex) => (
        <option key={token.address} value={tokenIndex}>
          {token.symbol}
        </option>
      ))}
    </select>
  )
}

function buttonText(state: {
  busy: string | null
  connected: boolean
  chainOk: boolean
  hasPool: boolean
  quoting: boolean
  ready: boolean
}): string {
  if (state.busy) return state.busy
  if (!state.connected) return 'Connect wallet'
  if (!state.chainOk) return 'Switch to BSC Testnet'
  if (!state.hasPool) return 'Choose a pool'
  if (state.quoting) return 'Quoting'
  if (!state.ready) return 'Enter an amount'
  return 'Swap'
}
