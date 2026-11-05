/** Binary-contract taker fee: rate × C × P × (1 − P), rounded up to the cent per order.
 * Kalshi publishes this formula with rate 0.07 (makers 0.0175); Polymarket uses the same
 * price shape with per-category rates and rounds finer, so this overstates it by < 1¢. */
export function takerFeeCents(quantity: number, priceCents: number, feeBps: number): number {
  if (!feeBps) return 0
  // The epsilon keeps a float product like 63.00000000000001 from rounding up a cent.
  return Math.ceil((feeBps * quantity * priceCents * (100 - priceCents)) / 1_000_000 - 1e-9)
}

/** Most contracts whose cost plus taker fee fits in cash; floor(cash / price) when fee-free. */
export function affordableQuantity(cashCents: number, priceCents: number, feeBps: number): number {
  if (!feeBps) return Math.floor(cashCents / priceCents)
  const perContract = priceCents + (feeBps * priceCents * (100 - priceCents)) / 1_000_000
  let quantity = Math.floor(cashCents / perContract)
  while (quantity > 0 && quantity * priceCents + takerFeeCents(quantity, priceCents, feeBps) > cashCents)
    quantity--
  return quantity
}
