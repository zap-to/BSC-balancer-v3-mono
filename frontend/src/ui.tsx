import type { Address, Hex } from 'viem'

import { EXPLORER } from './config'
import type { PoolSnapshot } from './chain'
import { formatFee, shortAddress } from './format'

export function TxLinks({ hashes }: { hashes: { label: string; hash: Hex }[] }) {
  if (hashes.length === 0) return null
  return (
    <p className="links">
      {hashes.map((item) => (
        <a key={item.hash} href={`${EXPLORER}/tx/${item.hash}`} target="_blank" rel="noreferrer">
          {item.label}
        </a>
      ))}
    </p>
  )
}

export function PoolSelect({
  pools,
  value,
  onChange,
}: {
  pools: PoolSnapshot[]
  value: string
  onChange: (address: Address) => void
}) {
  return (
    <label className="select">
      <span>Pool</span>
      <select
        value={value}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value as Address)
        }}
      >
        <option value="">Select a pool</option>
        {pools.map((pool) => (
          <option key={pool.address} value={pool.address}>
            {pool.symbol} · {formatFee(pool.fee)}
          </option>
        ))}
      </select>
    </label>
  )
}

export function AddressLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="addr-row">
      <span>{label}</span>
      <a href={`${EXPLORER}/address/${value}`} target="_blank" rel="noreferrer">
        <code>{value}</code>
      </a>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          void navigator.clipboard.writeText(value)
        }}
      >
        Copy
      </button>
    </div>
  )
}

export function poolLabel(pool: PoolSnapshot): string {
  return pool.symbol || shortAddress(pool.address)
}
