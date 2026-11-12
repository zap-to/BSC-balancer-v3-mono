import { BaseError, formatUnits } from 'viem'

import { WBNB } from './config'

export function explain(error: unknown): string {
  if (error instanceof BaseError) {
    return error.shortMessage
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Request failed'
}

export function shortAddress(value: string): string {
  if (value.length < 12) return value
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

export function trimDecimal(value: string): string {
  if (!value.includes('.')) return value
  return value.replace(/\.?0+$/, '')
}

export function formatAmount(value: bigint, decimals: number, max = 6): string {
  const raw = formatUnits(value, decimals)
  const [whole, fraction = ''] = raw.split('.')
  if (!fraction) return whole
  const cut = fraction.slice(0, max).replace(/0+$/, '')
  return cut ? `${whole}.${cut}` : whole
}

/** Swap fee is an 18-decimal fraction. 1% is 1e16. */
export function formatFee(fee: bigint): string {
  return `${trimDecimal(formatUnits(fee, 16))}%`
}

export function parseAmount(value: string, decimals: number): bigint | null {
  const trimmed = value.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null
  const fraction = trimmed.split('.')[1]
  if (fraction && fraction.length > decimals) return null
  return safeParse(trimmed, decimals)
}

function safeParse(value: string, decimals: number): bigint | null {
  try {
    const [whole, fraction = ''] = value.split('.')
    const padded = (fraction + '0'.repeat(decimals)).slice(0, decimals)
    return BigInt(whole + padded)
  } catch {
    return null
  }
}

export function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n
}

export function deadlineFromNow(seconds = 1_200): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + seconds)
}

export function isWbnb(address: string): boolean {
  return address.toLowerCase() === WBNB.toLowerCase()
}
