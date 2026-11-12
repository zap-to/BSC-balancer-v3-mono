import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createWalletClient, custom, type Address, type WalletClient } from 'viem'
import { bscTestnet } from 'viem/chains'

import { CHAIN_ID } from './config'

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
}

type WalletValue = {
  address: Address | null
  chainId: number | null
  chainOk: boolean
  walletClient: WalletClient | null
  connect: () => Promise<void>
  disconnect: () => void
  switchChain: () => Promise<void>
}

const WalletContext = createContext<WalletValue | null>(null)

function provider(): EthereumProvider | null {
  const ethereum = window.ethereum
  if (!ethereum || typeof ethereum.request !== 'function') return null
  return ethereum as EthereumProvider
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)

  useEffect(() => {
    const ethereum = provider()
    if (!ethereum?.on) return
    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0]
      if (!Array.isArray(accounts) || typeof accounts[0] !== 'string') {
        setAddress(null)
        return
      }
      setAddress(accounts[0] as Address)
    }
    const onChain = (...args: unknown[]) => {
      const next = args[0]
      if (typeof next === 'string') setChainId(Number(next))
    }
    ethereum.on('accountsChanged', onAccounts)
    ethereum.on('chainChanged', onChain)
    return () => {
      ethereum.removeListener?.('accountsChanged', onAccounts)
      ethereum.removeListener?.('chainChanged', onChain)
    }
  }, [])

  const walletClient = useMemo(() => {
    const ethereum = provider()
    if (!address || !ethereum) return null
    return createWalletClient({
      account: address,
      chain: bscTestnet,
      transport: custom(ethereum),
    })
  }, [address])

  async function connect() {
    const ethereum = provider()
    if (!ethereum) throw new Error('No injected wallet found')
    const accounts = (await ethereum.request({ method: 'eth_requestAccounts' })) as string[]
    const chain = (await ethereum.request({ method: 'eth_chainId' })) as string
    setAddress((accounts[0] as Address) ?? null)
    setChainId(Number(chain))
  }

  async function switchChain() {
    const ethereum = provider()
    if (!ethereum) throw new Error('No injected wallet found')
    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x61' }],
      })
      setChainId(CHAIN_ID)
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? Number(error.code) : 0
      if (code !== 4902) throw error
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: '0x61',
            chainName: 'BSC Testnet',
            nativeCurrency: { name: 'BNB', symbol: 'tBNB', decimals: 18 },
            rpcUrls: ['https://bsc-testnet-dataseed.bnbchain.org'],
            blockExplorerUrls: ['https://testnet.bscscan.com'],
          },
        ],
      })
      setChainId(CHAIN_ID)
    }
  }

  const value: WalletValue = {
    address,
    chainId,
    chainOk: chainId === CHAIN_ID,
    walletClient,
    connect,
    disconnect: () => setAddress(null),
    switchChain,
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletValue {
  const value = useContext(WalletContext)
  if (!value) throw new Error('WalletProvider is missing')
  return value
}
