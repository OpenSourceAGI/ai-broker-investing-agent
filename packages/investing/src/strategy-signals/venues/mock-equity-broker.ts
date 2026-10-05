import type { AccountSnapshot } from '../types'
import type { EquityOrder, EquityOrderClient } from '../execution'
import { isQuantity } from '../validate'
import { equityPriceCents } from '../execution'

export class MockEquityBroker implements EquityOrderClient {
  private account: Extract<AccountSnapshot, { kind: 'equity' }>
  constructor(
    private closes: Record<string, number>,
    cashCents = 100000
  ) {
    if (!isQuantity(cashCents)) throw new Error('invalid initial cash')
    this.account = { kind: 'equity', cashCents, shares: {} }
  }
  setClose(symbol: string, close: number): void {
    this.closes[symbol] = close
  }
  snapshot(): AccountSnapshot {
    return structuredClone(this.account)
  }
  async createOrder(
    order: EquityOrder
  ): Promise<{
    status: 'FILLED' | 'REJECTED'
    order: EquityOrder
    reason?: string
    account: AccountSnapshot
  }> {
    const reject = (reason: string) => ({
      status: 'REJECTED' as const,
      order,
      reason,
      account: this.snapshot()
    })
    let price: number
    try {
      price = equityPriceCents(this.closes[order.symbol])
    } catch {
      return reject('unsupported equity quote')
    }
    const holding = this.account.shares[order.symbol]
    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      !isQuantity(order.qty) ||
      !order.qty ||
      !['buy', 'sell'].includes(order.side) ||
      order.type !== 'market' ||
      order.time_in_force !== 'day'
    )
      return reject('invalid equity order')
    const cost = price * order.qty
    if (!Number.isSafeInteger(cost)) return reject('unsupported fractional-cent stock fill')
    if (order.side === 'buy') {
      if (cost > this.account.cashCents) return reject('insufficient cash')
      const quantity = (holding?.quantity ?? 0) + order.qty
      this.account.shares[order.symbol] = {
        quantity,
        averagePriceCents:
          ((holding?.quantity ?? 0) * (holding?.averagePriceCents ?? 0) + cost) / quantity
      }
      this.account.cashCents -= cost
    } else {
      if (!holding || holding.quantity < order.qty) return reject('insufficient shares')
      holding.quantity -= order.qty
      if (!holding.quantity) delete this.account.shares[order.symbol]
      this.account.cashCents += cost
    }
    return { status: 'FILLED', order, account: this.snapshot() }
  }
}
