import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Address } from 'viem'

import { discoverPools, loadPool, vaultIsDeployed, type PoolSnapshot } from './chain'
import { DEPLOYER, NAMESPACE, contracts, publicClient } from './config'
import { explain, shortAddress } from './format'
import { useWallet } from './wallet'
import { LiquidityView } from './views/Liquidity'
import { PoolsView } from './views/Pools'
import { ProtocolView } from './views/Protocol'
import { SwapView } from './views/Swap'

type View = 'swap' | 'pools' | 'liquidity' | 'protocol'

const NAV: { id: View; label: string }[] = [
  { id: 'swap', label: 'Swap' },
  { id: 'pools', label: 'Pools' },
  { id: 'liquidity', label: 'Liquidity' },
  { id: 'protocol', label: 'Deployment' },
]

export function App() {
  const wallet = useWallet()
  const [view, setView] = useState<View>('swap')
  const [pools, setPools] = useState<PoolSnapshot[]>([])
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null)
  const [busyPools, setBusyPools] = useState(false)
  const [vaultReady, setVaultReady] = useState<boolean | null>(null)
  const [block, setBlock] = useState<bigint | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const remember = useCallback((snapshot: PoolSnapshot) => {
    setPools((current) => {
      const rest = current.filter((pool) => pool.address.toLowerCase() !== snapshot.address.toLowerCase())
      return [snapshot, ...rest]
    })
    setSelectedAddress(snapshot.address)
  }, [])

  const select = useCallback(
    async (address: Address) => {
      setLoadError(null)
      const snapshot = await loadPool(address, wallet.address ?? undefined)
      remember(snapshot)
    },
    [remember, wallet.address],
  )

  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const live = await vaultIsDeployed()
        if (cancel) return
        setVaultReady(live)
        if (!live) return
        setBusyPools(true)
        const found = await discoverPools()
        const snapshots: PoolSnapshot[] = []
        for (const address of found) {
          try {
            snapshots.push(await loadPool(address))
          } catch {
            // A factory entry that the vault cannot read is skipped.
          }
        }
        if (!cancel) {
          setPools(snapshots)
          setSelectedAddress((current) => current ?? snapshots[0]?.address ?? null)
        }
      } catch (reason) {
        if (!cancel) setLoadError(explain(reason))
      } finally {
        if (!cancel) setBusyPools(false)
      }
    })()
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    if (!selectedAddress) return
    let cancel = false
    loadPool(selectedAddress, wallet.address ?? undefined)
      .then((snapshot) => {
        if (!cancel) remember(snapshot)
      })
      .catch(() => undefined)
    return () => {
      cancel = true
    }
  }, [selectedAddress, wallet.address, remember])

  useEffect(() => {
    let cancel = false
    const read = () => {
      publicClient
        .getBlockNumber()
        .then((next) => {
          if (!cancel) setBlock(next)
        })
        .catch(() => undefined)
    }
    read()
    const timer = window.setInterval(read, 12_000)
    return () => {
      cancel = true
      window.clearInterval(timer)
    }
  }, [])

  const selected = pools.find((pool) => pool.address.toLowerCase() === selectedAddress?.toLowerCase()) ?? null
  const wide = view === 'pools' || view === 'protocol'

  return (
    <div className="app">
      <div className="field" aria-hidden="true">
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
        <p className="watermark">Kindling</p>
      </div>
      <header className="header">
        <button type="button" className="brand" onClick={() => setView('swap')}>
          <Mark />
          <span>Kindling</span>
        </button>
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? 'active' : ''}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="spacer">
          <p className="net">
            {wallet.address && !wallet.chainOk ? 'Wrong network' : 'BSC Testnet'}
            {block !== null ? ` · ${block.toString()}` : ''}
          </p>
          {wallet.address ? (
            <button type="button" className="connect" onClick={wallet.disconnect}>
              {shortAddress(wallet.address)}
            </button>
          ) : (
            <button
              type="button"
              className="connect"
              onClick={() => {
                void wallet.connect().catch(() => undefined)
              }}
            >
              Connect
            </button>
          )}
        </div>
      </header>
      <AnimatePresence mode="wait">
        <motion.main
          key={view}
          className={wide ? 'workspace flow' : 'workspace'}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={wide ? 'stack wide' : 'stack'}>
            {vaultReady === false ? (
              <p className="banner">
                Your vault {contracts.vault} is not deployed. {DEPLOYER} needs about 0.03 tBNB on BSC Testnet before {NAMESPACE} can be broadcast.
              </p>
            ) : null}
            {loadError ? <p className="error">{loadError}</p> : null}
            <ViewBody
              view={view}
              pools={pools}
              selected={selected}
              busyPools={busyPools}
              onSelect={(address) => {
                void select(address).catch((reason: unknown) => setLoadError(explain(reason)))
              }}
              onTrade={(address) => {
                void select(address)
                  .then(() => setView('swap'))
                  .catch((reason: unknown) => setLoadError(explain(reason)))
              }}
              onLiquidity={(address) => {
                void select(address)
                  .then(() => setView('liquidity'))
                  .catch((reason: unknown) => setLoadError(explain(reason)))
              }}
            />
          </div>
        </motion.main>
      </AnimatePresence>
    </div>
  )
}

function ViewBody({
  view,
  pools,
  selected,
  busyPools,
  onSelect,
  onTrade,
  onLiquidity,
}: {
  view: View
  pools: PoolSnapshot[]
  selected: PoolSnapshot | null
  busyPools: boolean
  onSelect: (address: Address) => void
  onTrade: (address: Address) => void
  onLiquidity: (address: Address) => void
}) {
  switch (view) {
    case 'swap':
      return <SwapView pools={pools} selected={selected} onSelect={onSelect} />
    case 'pools':
      return (
        <PoolsView
          pools={pools}
          busy={busyPools}
          onSelect={onSelect}
          onTrade={onTrade}
          onLiquidity={onLiquidity}
        />
      )
    case 'liquidity':
      return <LiquidityView pools={pools} selected={selected} onSelect={onSelect} />
    case 'protocol':
      return <ProtocolView />
    default: {
      const unreachable: never = view
      return unreachable
    }
  }
}

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="kindling-mark" x1="4" y1="2" x2="28" y2="30">
          <stop offset="0" stopColor="#9ec2ff" />
          <stop offset="1" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      <path
        fill="url(#kindling-mark)"
        d="M16 3.2c5.6 6.6 9.4 10.6 9.4 16.1a9.4 9.4 0 1 1-18.8 0C6.6 13.8 10.4 9.8 16 3.2z"
      />
    </svg>
  )
}
