# pmxtjs - API Reference

A unified TypeScript SDK for interacting with multiple prediction market exchanges (Polymarket, Kalshi, Limitless)
identically.

## Installation

```bash
npm install pmxtjs
```

## Quick Start

```typescript
import pmxt from 'pmxtjs';

// Initialize exchanges (server starts automatically!)
const poly = new pmxt.Polymarket();
const kalshi = new pmxt.Kalshi();
const limitless = new pmxt.Limitless(); // Requires API key for authenticated operations

// Search for markets
const markets = await poly.fetchMarkets({ query: "Trump" });
console.log(markets[0].title);
```

> **Note**: This SDK automatically manages the PMXT sidecar server.

---

## Server Management

The SDK provides global functions to manage the background sidecar server. This is useful for clearing state or
resolving "port busy" errors.

### `stopServer`

Stop the background PMXT sidecar server and clean up lock files.

```typescript
import pmxt from 'pmxtjs';
await pmxt.stopServer();
```

### `restartServer`

Restart the background PMXT sidecar server. Equivalent to calling `stopServer()` followed by a fresh start.

```typescript
import pmxt from 'pmxtjs';
await pmxt.restartServer();
```

---

## Methods

### `loadMarkets`

How long (ms) a market snapshot created by `fetchMarketsPaginated` remains valid


**Signature:**

```typescript
async loadMarkets(reload: boolean): Promise<Record<string, UnifiedMarket>>
```

**Parameters:**

- `reload` (boolean): Force a fresh fetch from the API even if markets are already loaded

**Returns:** Promise<Record<string, UnifiedMarket>> - Dictionary of markets indexed by marketId

**Example:**

```typescript
// Stable pagination
await exchange.loadMarkets();
const all = Object.values(exchange.markets);
const page1 = all.slice(0, 100);
const page2 = all.slice(100, 200);
```


---
### `fetchMarkets`

Fetch markets with optional filtering, search, or slug lookup.


**Signature:**

```typescript
async fetchMarkets(params?: MarketFetchParams): Promise<UnifiedMarket[]>
```

**Parameters:**

- `params` (MarketFetchParams) - **Optional**: Optional parameters for filtering and search
  - `params.query` - Search keyword to filter markets
  - `params.slug` - Market slug/ticker for direct lookup
  - `params.limit` - Maximum number of results
  - `params.offset` - Pagination offset
  - `params.sort` - Sort order ('volume' | 'liquidity' | 'newest')
  - `params.searchIn` - Where to search ('title' | 'description' | 'both')

**Returns:** Promise<[UnifiedMarket](#unifiedmarket)[]> - Array of unified markets

**Example:**

```typescript
// Fetch markets
const markets = await exchange.fetchMarkets({ query: 'Trump', limit: 10000 });
console.log(markets[0].title);

// Get market by slug
const markets = await exchange.fetchMarkets({ slug: 'will-trump-win' });
```

**Notes:**
ordering — exchanges may reorder or add markets between requests. For stable iteration
across pages, use `loadMarkets()` and paginate over `Object.values(exchange.markets)`.
Some exchanges (like Limitless) may only support status 'active' for search results.

---
### `fetchMarketsPaginated`

Fetch markets with cursor-based pagination backed by a stable in-memory snapshot.


**Signature:**

```typescript
async fetchMarketsPaginated(params?: { limit?: number; cursor?: string }): Promise<PaginatedMarketsResult>
```

**Parameters:**

- `params` ({ limit?: number; cursor?: string }) - **Optional**: params
  - `params.limit` - Page size (default: return all markets)
  - `params.cursor` - Opaque cursor returned by a previous call

**Returns:** Promise<[PaginatedMarketsResult](#paginatedmarketsresult)> - PaginatedMarketsResult with data, total, and optional nextCursor

**Example:**

```typescript
// No example available
```


---
### `fetchEvents`

Fetch events with optional keyword search.


**Signature:**

```typescript
async fetchEvents(params?: EventFetchParams): Promise<UnifiedEvent[]>
```

**Parameters:**

- `params` ([EventFetchParams](#eventfetchparams)) - **Optional**: Optional parameters for search and filtering
  - `params.query` - Search keyword to filter events (required)
  - `params.limit` - Maximum number of results
  - `params.offset` - Pagination offset
  - `params.searchIn` - Where to search ('title' | 'description' | 'both')

**Returns:** Promise<[UnifiedEvent](#unifiedevent)[]> - Array of unified events

**Example:**

```typescript
// Search events
const events = await exchange.fetchEvents({ query: 'Fed Chair' });
const fedEvent = events[0];
console.log(fedEvent.title, fedEvent.markets.length, 'markets');
```

**Notes:**
Some exchanges (like Limitless) may only support status 'active' for search results.

---
### `fetchMarket`

Fetch a single market by lookup parameters.


**Signature:**

```typescript
async fetchMarket(params?: MarketFetchParams): Promise<UnifiedMarket>
```

**Parameters:**

- `params` (MarketFetchParams) - **Optional**: Lookup parameters (marketId, outcomeId, slug, etc.)

**Returns:** Promise<[UnifiedMarket](#unifiedmarket)> - A single unified market

**Example:**

```typescript
// Fetch by market ID
const market = await exchange.fetchMarket({ marketId: '663583' });

// Fetch by outcome ID
const market = await exchange.fetchMarket({ outcomeId: '10991849...' });
```


---
### `fetchEvent`

Fetch a single event by lookup parameters.


**Signature:**

```typescript
async fetchEvent(params?: EventFetchParams): Promise<UnifiedEvent>
```

**Parameters:**

- `params` ([EventFetchParams](#eventfetchparams)) - **Optional**: Lookup parameters (eventId, slug, query)

**Returns:** Promise<[UnifiedEvent](#unifiedevent)> - A single unified event

**Example:**

```typescript
// Fetch by event ID
const event = await exchange.fetchEvent({ eventId: 'TRUMP25DEC' });
```


---
### `fetchOHLCV`

Fetch historical OHLCV (candlestick) price data for a specific market outcome.


**Signature:**

```typescript
async fetchOHLCV(id: string, params: OHLCVParams | HistoryFilterParams): Promise<PriceCandle[]>
```

**Parameters:**

- `id` (string): The Outcome ID (outcomeId). Use outcome.outcomeId, NOT market.marketId
- `params` (OHLCVParams | HistoryFilterParams): OHLCV parameters including resolution (required)

**Returns:** Promise<[PriceCandle](#pricecandle)[]> - Array of price candles

**Example:**

```typescript
// Fetch hourly candles
const markets = await exchange.fetchMarkets({ query: 'Trump' });
const outcomeId = markets[0].yes.outcomeId;
const candles = await exchange.fetchOHLCV(outcomeId, {
  resolution: '1h',
  limit: 100
});
console.log(`Latest close: ${candles[candles.length - 1].close}`);
```

**Notes:**
**CRITICAL**: Use `outcome.outcomeId` (TS) / `outcome.outcome_id` (Python), not the market ID.
Polymarket: outcomeId is the CLOB Token ID. Kalshi: outcomeId is the Market Ticker.
Resolution options: '1m' | '5m' | '15m' | '1h' | '6h' | '1d'

---
### `fetchOrderBook`

Fetch the current order book (bids/asks) for a specific outcome.


**Signature:**

```typescript
async fetchOrderBook(id: string): Promise<OrderBook>
```

**Parameters:**

- `id` (string): The Outcome ID (outcomeId)

**Returns:** Promise<[OrderBook](#orderbook)> - Current order book with bids and asks

**Example:**

```typescript
// Fetch order book
const book = await exchange.fetchOrderBook(outcome.outcomeId);
console.log(`Best bid: ${book.bids[0].price}`);
console.log(`Best ask: ${book.asks[0].price}`);
console.log(`Spread: ${(book.asks[0].price - book.bids[0].price) * 100}%`);
```


---
### `fetchTrades`

Fetch raw trade history for a specific outcome.


**Signature:**

```typescript
async fetchTrades(id: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]>
```

**Parameters:**

- `id` (string): The Outcome ID (outcomeId)
- `params` (TradesParams | HistoryFilterParams): Trade filter parameters

**Returns:** Promise<[Trade](#trade)[]> - Array of recent trades

**Example:**

```typescript
// Fetch recent trades
const trades = await exchange.fetchTrades(outcome.outcomeId, { limit: 100 });
for (const trade of trades) {
  console.log(`${trade.side} ${trade.amount} @ ${trade.price}`);
}
```

**Notes:**
Polymarket requires an API key for trade history. Use fetchOHLCV for public historical data.

---
### `createOrder`

Place a new order on the exchange.


**Signature:**

```typescript
async createOrder(params: CreateOrderParams): Promise<Order>
```

**Parameters:**

- `params` ([CreateOrderParams](#createorderparams)): Order parameters

**Returns:** Promise<[Order](#order)> - The created order

**Example:**

```typescript
// Place a limit order
const order = await exchange.createOrder({
  marketId: market.marketId,
  outcomeId: market.yes.outcomeId,
  side: 'buy',
  type: 'limit',
  amount: 10,
  price: 0.55
});
console.log(`Order ${order.id}: ${order.status}`);

// Place a market order
const order = await exchange.createOrder({
  marketId: market.marketId,
  outcomeId: market.yes.outcomeId,
  side: 'buy',
  type: 'market',
  amount: 5
});
```


---
### `cancelOrder`

Cancel an existing open order.


**Signature:**

```typescript
async cancelOrder(orderId: string): Promise<Order>
```

**Parameters:**

- `orderId` (string): The order ID to cancel

**Returns:** Promise<[Order](#order)> - The cancelled order

**Example:**

```typescript
// Cancel an order
const cancelled = await exchange.cancelOrder('order-123');
console.log(cancelled.status); // 'cancelled'
```


---
### `fetchOrder`

Fetch a specific order by ID.


**Signature:**

```typescript
async fetchOrder(orderId: string): Promise<Order>
```

**Parameters:**

- `orderId` (string): The order ID to look up

**Returns:** Promise<[Order](#order)> - The order details

**Example:**

```typescript
// Fetch order status
const order = await exchange.fetchOrder('order-456');
console.log(`Filled: ${order.filled}/${order.amount}`);
```


---
### `fetchOpenOrders`

Fetch all open orders, optionally filtered by market.


**Signature:**

```typescript
async fetchOpenOrders(marketId?: string): Promise<Order[]>
```

**Parameters:**

- `marketId` (string) - **Optional**: Optional market ID to filter by

**Returns:** Promise<[Order](#order)[]> - Array of open orders

**Example:**

```typescript
// Fetch all open orders
const orders = await exchange.fetchOpenOrders();
for (const order of orders) {
  console.log(`${order.side} ${order.amount} @ ${order.price}`);
}

// Fetch orders for a specific market
const orders = await exchange.fetchOpenOrders('FED-25JAN');
```


---
### `fetchPositions`

Fetch current user positions across all markets.


**Signature:**

```typescript
async fetchPositions(): Promise<Position[]>
```

**Parameters:**

- None

**Returns:** Promise<[Position](#position)[]> - Array of user positions

**Example:**

```typescript
// Fetch positions
const positions = await exchange.fetchPositions();
for (const pos of positions) {
  console.log(`${pos.outcomeLabel}: ${pos.size} @ $${pos.entryPrice}`);
  console.log(`Unrealized P&L: $${pos.unrealizedPnL.toFixed(2)}`);
}
```


---
### `fetchBalance`

Fetch account balances.


**Signature:**

```typescript
async fetchBalance(): Promise<Balance[]>
```

**Parameters:**

- None

**Returns:** Promise<[Balance](#balance)[]> - Array of account balances

**Example:**

```typescript
// Fetch balance
const balances = await exchange.fetchBalance();
console.log(`Available: $${balances[0].available}`);
```


---
### `getExecutionPrice`

Calculate the volume-weighted average execution price for a given order size.


**Signature:**

```typescript
async getExecutionPrice(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): Promise<number>
```

**Parameters:**

- `orderBook` ([OrderBook](#orderbook)): The current order book
- `side` ('buy' | 'sell'): 'buy' or 'sell'
- `amount` (number): Number of contracts to simulate

**Returns:** Promise<number> - Average execution price, or 0 if insufficient liquidity

**Example:**

```typescript
// Get execution price
const book = await exchange.fetchOrderBook(outcome.outcomeId);
const price = exchange.getExecutionPrice(book, 'buy', 100);
console.log(`Avg price for 100 contracts: ${price}`);
```


---
### `getExecutionPriceDetailed`

Calculate detailed execution price information including partial fill data.


**Signature:**

```typescript
async getExecutionPriceDetailed(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): Promise<ExecutionPriceResult>
```

**Parameters:**

- `orderBook` ([OrderBook](#orderbook)): The current order book
- `side` ('buy' | 'sell'): 'buy' or 'sell'
- `amount` (number): Number of contracts to simulate

**Returns:** Promise<[ExecutionPriceResult](#executionpriceresult)> - Detailed execution result with price, filled amount, and fill status

**Example:**

```typescript
// Get detailed execution price
const book = await exchange.fetchOrderBook(outcome.outcomeId);
const result = exchange.getExecutionPriceDetailed(book, 'buy', 100);
console.log(`Price: ${result.price}`);
console.log(`Filled: ${result.filledAmount}/${100}`);
console.log(`Fully filled: ${result.fullyFilled}`);
```


---
### `filterMarkets`

Filter a list of markets by criteria.


**Signature:**

```typescript
async filterMarkets(markets: UnifiedMarket[], criteria: string | MarketFilterCriteria | MarketFilterFunction): Promise<UnifiedMarket[]>
```

**Parameters:**

- `markets` ([UnifiedMarket](#unifiedmarket)[]): Array of markets to filter
- `criteria` (string | MarketFilterCriteria | MarketFilterFunction): Filter criteria: string (text search), object (structured), or function (predicate)

**Returns:** Promise<[UnifiedMarket](#unifiedmarket)[]> - Filtered array of markets

**Example:**

```typescript
// Simple text search
const filtered = exchange.filterMarkets(markets, 'Trump');

// Advanced criteria
const undervalued = exchange.filterMarkets(markets, {
  text: 'Election',
  volume24h: { min: 10000 },
  price: { outcome: 'yes', max: 0.4 }
});

// Custom predicate
const volatile = exchange.filterMarkets(markets,
  m => m.yes?.priceChange24h < -0.1
);
```


---
### `filterEvents`

Filter a list of events by criteria.


**Signature:**

```typescript
async filterEvents(events: UnifiedEvent[], criteria: string | EventFilterCriteria | EventFilterFunction): Promise<UnifiedEvent[]>
```

**Parameters:**

- `events` ([UnifiedEvent](#unifiedevent)[]): Array of events to filter
- `criteria` (string | EventFilterCriteria | EventFilterFunction): Filter criteria: string (text search), object (structured), or function (predicate)

**Returns:** Promise<[UnifiedEvent](#unifiedevent)[]> - Filtered array of events

**Example:**

```typescript
// Filter by category
const filtered = exchange.filterEvents(events, {
  category: 'Politics',
  marketCount: { min: 5 }
});
```


---
### `watchOrderBook`

Watch order book updates in real-time via WebSocket.


**Signature:**

```typescript
async watchOrderBook(id: string, limit?: number): Promise<OrderBook>
```

**Parameters:**

- `id` (string): The Outcome ID to watch
- `limit` (number) - **Optional**: Optional limit for orderbook depth

**Returns:** Promise<[OrderBook](#orderbook)> - Promise that resolves with the current orderbook state

**Example:**

```typescript
// Stream order book
while (true) {
  const book = await exchange.watchOrderBook(outcome.outcomeId);
  console.log(`Bid: ${book.bids[0]?.price} Ask: ${book.asks[0]?.price}`);
}
```


---
### `watchTrades`

Watch trade executions in real-time via WebSocket.


**Signature:**

```typescript
async watchTrades(id: string, since?: number, limit?: number): Promise<Trade[]>
```

**Parameters:**

- `id` (string): The Outcome ID to watch
- `since` (number) - **Optional**: Optional timestamp to filter trades from
- `limit` (number) - **Optional**: Optional limit for number of trades

**Returns:** Promise<[Trade](#trade)[]> - Promise that resolves with recent trades

**Example:**

```typescript
// Stream trades
while (true) {
  const trades = await exchange.watchTrades(outcome.outcomeId);
  for (const trade of trades) {
    console.log(`${trade.side} ${trade.amount} @ ${trade.price}`);
  }
}
```


---
### `close`

Close all WebSocket connections and clean up resources.


**Signature:**

```typescript
async close(): Promise<void>
```

**Parameters:**

- None

**Returns:** Promise<void> - Result

**Example:**

```typescript
// Close connections
await exchange.close();
```


---
### `implicitApi`

Introspection getter: returns info about all implicit API methods.


**Signature:**

```typescript
async implicitApi(): Promise<ImplicitApiMethodInfo[]>
```

**Parameters:**

- None

**Returns:** Promise<ImplicitApiMethodInfo[]> - Result

**Example:**

```typescript
// No example available
```


---
### `watchPrices`

Watch AMM price updates for a market address (Limitless only).

> **Note**: This method is only available on **limitless** exchange.


**Signature:**

```typescript
async watchPrices(marketAddress: string, callback: (data: any)): Promise<void>
```

**Parameters:**

- `marketAddress` (string): Market contract address
- `callback` ((data: any)): Callback for price updates

**Returns:** Promise<void> - Result

**Example:**

```typescript
// Watch prices
await exchange.watchPrices(marketAddress, (data) => {
  console.log('Price update:', data);
});
```


---
### `watchUserPositions`

Watch user positions in real-time (Limitless only).

> **Note**: This method is only available on **limitless** exchange.


**Signature:**

```typescript
async watchUserPositions(callback: (data: any)): Promise<void>
```

**Parameters:**

- `callback` ((data: any)): Callback for position updates

**Returns:** Promise<void> - Result

**Example:**

```typescript
// Watch positions
await exchange.watchUserPositions((data) => {
  console.log('Position update:', data);
});
```


---
### `watchUserTransactions`

Watch user transactions in real-time (Limitless only).

> **Note**: This method is only available on **limitless** exchange.


**Signature:**

```typescript
async watchUserTransactions(callback: (data: any)): Promise<void>
```

**Parameters:**

- `callback` ((data: any)): Callback for transaction updates

**Returns:** Promise<void> - Result

**Example:**

```typescript
// Watch transactions
await exchange.watchUserTransactions((data) => {
  console.log('Transaction:', data);
});
```


---
### `initAuth`

Initialize L2 API credentials for implicit API signing.

> **Note**: This method is only available on **polymarket** exchange.


**Signature:**

```typescript
async initAuth(): Promise<void>
```

**Parameters:**

- None

**Returns:** Promise<void> - Result

**Example:**

```typescript
// No example available
```


---
### `preWarmMarket`

Pre-warm the SDK's internal caches for a market outcome.

> **Note**: This method is only available on **polymarket** exchange.


**Signature:**

```typescript
async preWarmMarket(outcomeId: string): Promise<void>
```

**Parameters:**

- `outcomeId` (string): The CLOB Token ID for the outcome (use `outcome.outcomeId`)

**Returns:** Promise<void> - Result

**Example:**

```typescript
// Pre-warm before placing orders
const markets = await exchange.fetchMarkets({ query: 'Trump' });
const outcomeId = markets[0].outcomes[0].outcomeId;
await exchange.preWarmMarket(outcomeId);
// Subsequent createOrder calls are faster
```


---
### `getEventById`

Fetch a single event by its numeric ID (Probable only).

> **Note**: This method is only available on **probable** exchange.


**Signature:**

```typescript
async getEventById(id: string): Promise<UnifiedEvent | null>
```

**Parameters:**

- `id` (string): The numeric event ID

**Returns:** Promise<UnifiedEvent | null> - The UnifiedEvent, or null if not found

**Example:**

```typescript
// Get event by ID
const event = await exchange.getEventById('42');
if (event) {
  console.log(event.title);
  console.log(event.markets.length, 'markets');
}
```


---
### `getEventBySlug`

Fetch a single event by its URL slug (Probable only).

> **Note**: This method is only available on **probable** exchange.


**Signature:**

```typescript
async getEventBySlug(slug: string): Promise<UnifiedEvent | null>
```

**Parameters:**

- `slug` (string): The event's URL slug (e.g. `"trump-2024-election"`)

**Returns:** Promise<UnifiedEvent | null> - The UnifiedEvent, or null if not found

**Example:**

```typescript
// Get event by slug
const event = await exchange.getEventBySlug('trump-2024-election');
if (event) {
  console.log(event.title);
}
```


---

## Complete Trading Workflow

```typescript
import pmxt from 'pmxtjs';

const exchange = new pmxt.Polymarket({
  privateKey: process.env.POLYMARKET_PRIVATE_KEY
});

// 1. Check balance
const [balance] = await exchange.fetchBalance();
console.log(`Available: $${balance.available}`);

// 2. Search for a market
const markets = await exchange.fetchMarkets({ query: 'Trump' });
const market = markets[0];
const outcome = market.yes;

console.log(market.title);
console.log(`Price: ${(outcome.price * 100).toFixed(1)}%`);

// 3. Place a limit order
const order = await exchange.createOrder({
  marketId: market.marketId,
  outcomeId: outcome.outcomeId,
  side: 'buy',
  type: 'limit',
  amount: 10,
  price: 0.50
});

console.log(`Order placed: ${order.id}`);

// 4. Check order status
const updatedOrder = await exchange.fetchOrder(order.id);
console.log(`Status: ${updatedOrder.status}`);
console.log(`Filled: ${updatedOrder.filled}/${updatedOrder.amount}`);

// 5. Cancel if needed
if (updatedOrder.status === 'open') {
  await exchange.cancelOrder(order.id);
  console.log('Order cancelled');
}

// 6. Check positions
const positions = await exchange.fetchPositions();
positions.forEach(pos => {
  console.log(`${pos.outcomeLabel}: ${pos.unrealizedPnL > 0 ? '+' : ''}$${pos.unrealizedPnL.toFixed(2)}`);
});
```

## Data Models

### `UnifiedMarket`



```typescript
interface UnifiedMarket {
marketId: string; // The unique identifier for this market
title: string; // 
description: string; // 
outcomes: MarketOutcome[]; // 
eventId: string; // Link to parent event
resolutionDate: string; // 
volume24h: number; // 
volume: number; // 
liquidity: number; // 
openInterest: number; // 
url: string; // 
image: string; // 
category: string; // 
tags: string[]; // 
yes: MarketOutcome; // 
no: MarketOutcome; // 
up: MarketOutcome; // 
down: MarketOutcome; // 
}
```

---
### `MarketOutcome`



```typescript
interface MarketOutcome {
outcomeId: string; // Outcome ID for trading operations (CLOB Token ID for Polymarket, Market Ticker for Kalshi)
marketId: string; // The market this outcome belongs to (set automatically)
label: string; // 
price: number; // 
priceChange24h: number; // 
metadata: object; // Exchange-specific metadata (e.g., clobTokenId for Polymarket)
}
```

---
### `UnifiedEvent`

A grouped collection of related markets (e.g., "Who will be Fed Chair?" contains multiple candidate markets)

```typescript
interface UnifiedEvent {
id: string; // 
title: string; // 
description: string; // 
slug: string; // 
markets: UnifiedMarket[]; // 
url: string; // 
image: string; // 
category: string; // 
tags: string[]; // 
}
```

---
### `PriceCandle`



```typescript
interface PriceCandle {
timestamp: number; // 
open: number; // 
high: number; // 
low: number; // 
close: number; // 
volume: number; // 
}
```

---
### `OrderBook`



```typescript
interface OrderBook {
bids: OrderLevel[]; // 
asks: OrderLevel[]; // 
timestamp: number; // 
}
```

---
### `OrderLevel`



```typescript
interface OrderLevel {
price: number; // 
size: number; // 
}
```

---
### `Trade`



```typescript
interface Trade {
id: string; // 
price: number; // 
amount: number; // 
side: string; // 
timestamp: number; // 
}
```

---
### `UserTrade`



```typescript
interface UserTrade {
id: string; // 
price: number; // 
amount: number; // 
side: string; // 
timestamp: number; // 
orderId: string; // 
outcomeId: string; // 
marketId: string; // 
}
```

---
### `Order`



```typescript
interface Order {
id: string; // 
marketId: string; // 
outcomeId: string; // 
side: string; // 
type: string; // 
price: number; // 
amount: number; // 
status: string; // 
filled: number; // 
remaining: number; // 
timestamp: number; // 
fee: number; // 
}
```

---
### `Position`



```typescript
interface Position {
marketId: string; // 
outcomeId: string; // 
outcomeLabel: string; // 
size: number; // 
entryPrice: number; // 
currentPrice: number; // 
unrealizedPnL: number; // 
realizedPnL: number; // 
}
```

---
### `Balance`



```typescript
interface Balance {
currency: string; // 
total: number; // 
available: number; // 
locked: number; // 
}
```

---
### `ExecutionPriceResult`



```typescript
interface ExecutionPriceResult {
price: number; // 
filledAmount: number; // 
fullyFilled: boolean; // 
}
```

---
### `PaginatedMarketsResult`



```typescript
interface PaginatedMarketsResult {
data: UnifiedMarket[]; // 
total: number; // 
nextCursor: string; // 
}
```

---
### `ExchangeCredentials`

Optional authentication credentials for exchange operations

```typescript
interface ExchangeCredentials {
apiKey: string; // API key for the exchange
privateKey: string; // Private key for signing transactions
apiSecret: string; // API secret (if required by exchange)
passphrase: string; // Passphrase (if required by exchange)
funderAddress: string; // The address funding the trades (Proxy address)
signatureType: any; // Signature type (0=EOA, 1=Poly Proxy, 2=Gnosis Safe, or names like 'gnosis_safe')
}
```

---

## Filter Parameters

### `BaseRequest`

Base request structure with optional credentials

```typescript
interface BaseRequest {
credentials?: ExchangeCredentials; // 
}
```

---
### `MarketFilterParams`



```typescript
interface MarketFilterParams {
limit?: number; // 
offset?: number; // 
sort?: string; // 
status?: string; // Filter by market status (default: active)
searchIn?: string; // 
query?: string; // 
slug?: string; // 
marketId?: string; // Direct lookup by market ID
outcomeId?: string; // Reverse lookup -- find market containing this outcome
eventId?: string; // Find markets belonging to an event
page?: number; // 
similarityThreshold?: number; // 
}
```

---
### `EventFetchParams`



```typescript
interface EventFetchParams {
query?: string; // 
sort?: string; // 
limit?: number; // 
offset?: number; // 
status?: string; // Filter by event status (default: active)
searchIn?: string; // 
eventId?: string; // Direct lookup by event ID
slug?: string; // Lookup by event slug
}
```

---
### `HistoryFilterParams`

Deprecated - use OHLCVParams or TradesParams instead. Resolution is optional for backward compatibility.

```typescript
interface HistoryFilterParams {
resolution?: string; // 
start?: string; // 
end?: string; // 
limit?: number; // 
}
```

---
### `OHLCVParams`



```typescript
interface OHLCVParams {
resolution: string; // Candle interval for aggregation
start?: string; // 
end?: string; // 
limit?: number; // 
}
```

---
### `TradesParams`

Parameters for fetching trade history. No resolution parameter - trades are discrete events.

```typescript
interface TradesParams {
start?: string; // 
end?: string; // 
limit?: number; // 
}
```

---
### `CreateOrderParams`



```typescript
interface CreateOrderParams {
marketId: string; // 
outcomeId: string; // 
side: string; // 
type: string; // 
amount: number; // 
price?: number; // 
fee?: number; // 
}
```

---
### `MyTradesParams`



```typescript
interface MyTradesParams {
outcomeId?: string; // Filter to specific outcome/ticker
marketId?: string; // Filter to specific market
since?: string; // 
until?: string; // 
limit?: number; // 
cursor?: string; // For Kalshi cursor pagination
}
```

---
### `OrderHistoryParams`



```typescript
interface OrderHistoryParams {
marketId?: string; // Required for Limitless (slug)
since?: string; // 
until?: string; // 
limit?: number; // 
cursor?: string; // 
}
```

---

## Low-Level API Reference

Advanced: call exchange-specific REST endpoints directly via `exchange.callApi(name, params)`.

```typescript
// Example
const result = await exchange.callApi('operationName', { param: 'value' });
```

### Polymarket

| `callApi()` name | Method | Path | Summary | Auth |
|-----------------|--------|------|---------|------|
| `getGammaStatus` | `GET` | `/status` | Gamma API Health check | Public |
| `listTeams` | `GET` | `/teams` | List teams | Public |
| `getSportsMetadata` | `GET` | `/sports` | Get sports metadata information | Public |
| `getSportsMarketTypes` | `GET` | `/sports/market-types` | Get valid sports market types | Public |
| `listTags` | `GET` | `/tags` | List tags | Public |
| `getTag` | `GET` | `/tags/{id}` | Get tag by id | Public |
| `getRelatedTagsById` | `GET` | `/tags/{id}/related-tags` | Get related tags (relationships) by tag id | Public |
| `getRelatedTagsBySlug` | `GET` | `/tags/slug/{slug}/related-tags` | Get related tags (relationships) by tag slug | Public |
| `getTagsRelatedToATagById` | `GET` | `/tags/{id}/related-tags/tags` | Get tags related to a tag id | Public |
| `getTagsRelatedToATagBySlug` | `GET` | `/tags/slug/{slug}/related-tags/tags` | Get tags related to a tag slug | Public |
| `listEvents` | `GET` | `/events` | List events | Public |
| `getEvent` | `GET` | `/events/{id}` | Get event by id | Public |
| `getEventTags` | `GET` | `/events/{id}/tags` | Get event tags | Public |
| `getEventBySlug` | `GET` | `/events/slug/{slug}` | Get event by slug | Public |
| `listMarkets` | `GET` | `/markets` | List markets | Public |
| `getMarket` | `GET` | `/markets/{id}` | Get market by id | Public |
| `getMarketTags` | `GET` | `/markets/{id}/tags` | Get market tags by id | Public |
| `getMarketBySlug` | `GET` | `/markets/slug/{slug}` | Get market by slug | Public |
| `listSeries` | `GET` | `/series` | List series | Public |
| `getSeries` | `GET` | `/series/{id}` | Get series by id | Public |
| `listComments` | `GET` | `/comments` | List comments | Public |
| `getCommentsById` | `GET` | `/comments/{id}` | Get comments by comment id | Public |
| `getPublicProfile` | `GET` | `/public-profile` | Get public profile by wallet address | Public |
| `publicSearch` | `GET` | `/public-search` | Search markets, events, and profiles | Public |
| `getBook` | `GET` | `/book` | Get order book summary | Public |
| `postBooks` | `POST` | `/books` | Get multiple order books summaries | Public |
| `getPrice` | `GET` | `/price` | Get market price | Public |
| `getPrices` | `GET` | `/prices` | Get multiple market prices | Public |
| `postPrices` | `POST` | `/prices` | Get multiple market prices by request | Public |
| `getMidpoint` | `GET` | `/midpoint` | Get midpoint price | Public |
| `postSpreads` | `POST` | `/spreads` | Get bid-ask spreads | Public |
| `getPricesHistory` | `GET` | `/prices-history` | Get price history for a traded token | Public |
| `postAuthApiKey` | `POST` | `/auth/api-key` | Create API Key | Required |
| `getAuthDeriveApiKey` | `GET` | `/auth/derive-api-key` | Derive API Key | Required |
| `postOrder` | `POST` | `/order` | Place Single Order | Required |
| `deleteOrder` | `DELETE` | `/order` | Cancel Single Order | Required |
| `postOrders` | `POST` | `/orders` | Place Multiple Orders (Batch) | Required |
| `deleteOrders` | `DELETE` | `/orders` | Cancel Multiple Orders | Required |
| `deleteCancelAll` | `DELETE` | `/cancel-all` | Cancel All Orders | Required |
| `deleteCancelMarketOrders` | `DELETE` | `/cancel-market-orders` | Cancel Market Orders | Required |
| `getDataOrder` | `GET` | `/data/order/{id}` | Get Order | Required |
| `getDataOrders` | `GET` | `/data/orders` | Get Active Orders | Required |
| `getDataTrades` | `GET` | `/data/trades` | Get Trades | Required |
| `getOrderScoring` | `GET` | `/order-scoring` | Check Order Reward Scoring | Required |
| `postOrdersScoring` | `POST` | `/orders-scoring` | Check Multiple Orders Scoring | Required |
| `getGeoblock` | `GET` | `/geoblock` | Check Geoblock Status | Public |
| `getDataApiHealth` | `GET` | `/` | Data API Health check | Public |
| `getPositions` | `GET` | `/positions` | Get current positions for a user | Public |
| `getV1AccountingSnapshot` | `GET` | `/v1/accounting/snapshot` | Download an accounting snapshot (ZIP of CSVs) | Public |
| `getTraded` | `GET` | `/traded` | Get total markets a user has traded | Public |
| `getOi` | `GET` | `/oi` | Get open interest | Public |
| `getLiveVolume` | `GET` | `/live-volume` | Get live volume for an event | Public |
| `getTrades` | `GET` | `/trades` | Get trades for a user or markets | Public |
| `getActivity` | `GET` | `/activity` | Get user activity | Public |
| `getHolders` | `GET` | `/holders` | Get top holders for markets | Public |
| `getValue` | `GET` | `/value` | Get total value of a user's positions | Public |
| `getClosedPositions` | `GET` | `/closed-positions` | Get closed positions for a user | Public |
| `getV1MarketPositions` | `GET` | `/v1/market-positions` | Get positions for a market | Public |
| `getV1Leaderboard` | `GET` | `/v1/leaderboard` | Get trader leaderboard rankings | Public |
| `getV1BuildersLeaderboard` | `GET` | `/v1/builders/leaderboard` | Get aggregated builder leaderboard | Public |

#### Endpoint Details

##### `getGammaStatus`

**GET** `/status`

Gamma API Health check


---
##### `listTeams`

**GET** `/teams`

List teams

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `league` (query, array)
- `name` (query, array)
- `abbreviation` (query, array)

---
##### `getSportsMetadata`

**GET** `/sports`

Get sports metadata information


---
##### `getSportsMarketTypes`

**GET** `/sports/market-types`

Get valid sports market types


---
##### `listTags`

**GET** `/tags`

List tags

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `include_template` (query, boolean)
- `is_carousel` (query, boolean)

---
##### `getTag`

**GET** `/tags/{id}`

Get tag by id

**Parameters:**
- `` (, string)
- `include_template` (query, boolean)

---
##### `getRelatedTagsById`

**GET** `/tags/{id}/related-tags`

Get related tags (relationships) by tag id

**Parameters:**
- `` (, string)
- `omit_empty` (query, boolean)
- `status` (query, string) — enum: `active,closed,all`

---
##### `getRelatedTagsBySlug`

**GET** `/tags/slug/{slug}/related-tags`

Get related tags (relationships) by tag slug

**Parameters:**
- `` (, string)
- `omit_empty` (query, boolean)
- `status` (query, string) — enum: `active,closed,all`

---
##### `getTagsRelatedToATagById`

**GET** `/tags/{id}/related-tags/tags`

Get tags related to a tag id

**Parameters:**
- `` (, string)
- `omit_empty` (query, boolean)
- `status` (query, string) — enum: `active,closed,all`

---
##### `getTagsRelatedToATagBySlug`

**GET** `/tags/slug/{slug}/related-tags/tags`

Get tags related to a tag slug

**Parameters:**
- `` (, string)
- `omit_empty` (query, boolean)
- `status` (query, string) — enum: `active,closed,all`

---
##### `listEvents`

**GET** `/events`

List events

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `id` (query, array)
- `tag_id` (query, integer)
- `exclude_tag_id` (query, array)
- `slug` (query, array)
- `tag_slug` (query, string)
- `related_tags` (query, boolean)
- `active` (query, boolean)
- `archived` (query, boolean)
- `featured` (query, boolean)
- `cyom` (query, boolean)
- `include_chat` (query, boolean)
- `include_template` (query, boolean)
- `recurrence` (query, string)
- `closed` (query, boolean)
- `liquidity_min` (query, number)
- `liquidity_max` (query, number)
- `volume_min` (query, number)
- `volume_max` (query, number)
- `start_date_min` (query, string)
- `start_date_max` (query, string)
- `end_date_min` (query, string)
- `end_date_max` (query, string)

---
##### `getEvent`

**GET** `/events/{id}`

Get event by id

**Parameters:**
- `` (, string)
- `include_chat` (query, boolean)
- `include_template` (query, boolean)

---
##### `getEventTags`

**GET** `/events/{id}/tags`

Get event tags

**Parameters:**
- `` (, string)

---
##### `getEventBySlug`

**GET** `/events/slug/{slug}`

Get event by slug

**Parameters:**
- `` (, string)
- `include_chat` (query, boolean)
- `include_template` (query, boolean)

---
##### `listMarkets`

**GET** `/markets`

List markets

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `id` (query, array)
- `slug` (query, array)
- `clob_token_ids` (query, array)
- `condition_ids` (query, array)
- `market_maker_address` (query, array)
- `liquidity_num_min` (query, number)
- `liquidity_num_max` (query, number)
- `volume_num_min` (query, number)
- `volume_num_max` (query, number)
- `start_date_min` (query, string)
- `start_date_max` (query, string)
- `end_date_min` (query, string)
- `end_date_max` (query, string)
- `tag_id` (query, integer)
- `related_tags` (query, boolean)
- `cyom` (query, boolean)
- `uma_resolution_status` (query, string)
- `game_id` (query, string)
- `sports_market_types` (query, array)
- `rewards_min_size` (query, number)
- `question_ids` (query, array)
- `include_tag` (query, boolean)
- `closed` (query, boolean)

---
##### `getMarket`

**GET** `/markets/{id}`

Get market by id

**Parameters:**
- `` (, string)
- `include_tag` (query, boolean)

---
##### `getMarketTags`

**GET** `/markets/{id}/tags`

Get market tags by id

**Parameters:**
- `` (, string)

---
##### `getMarketBySlug`

**GET** `/markets/slug/{slug}`

Get market by slug

**Parameters:**
- `` (, string)
- `include_tag` (query, boolean)

---
##### `listSeries`

**GET** `/series`

List series

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `slug` (query, array)
- `categories_ids` (query, array)
- `categories_labels` (query, array)
- `closed` (query, boolean)
- `include_chat` (query, boolean)
- `recurrence` (query, string)

---
##### `getSeries`

**GET** `/series/{id}`

Get series by id

**Parameters:**
- `` (, string)
- `include_chat` (query, boolean)

---
##### `listComments`

**GET** `/comments`

List comments

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `parent_entity_type` (query, string) — enum: `Event,Series,market`
- `parent_entity_id` (query, integer)
- `get_positions` (query, boolean)
- `holders_only` (query, boolean)

---
##### `getCommentsById`

**GET** `/comments/{id}`

Get comments by comment id

**Parameters:**
- `id` (path, integer) **required**
- `get_positions` (query, boolean)

---
##### `getPublicProfile`

**GET** `/public-profile`

Get public profile by wallet address

**Parameters:**
- `address` (query, string) **required** — The wallet address (proxy wallet or user address)

---
##### `publicSearch`

**GET** `/public-search`

Search markets, events, and profiles

**Parameters:**
- `q` (query, string) **required**
- `cache` (query, boolean)
- `events_status` (query, string)
- `limit_per_type` (query, integer)
- `page` (query, integer)
- `events_tag` (query, array)
- `keep_closed_markets` (query, integer)
- `sort` (query, string)
- `ascending` (query, boolean)
- `search_tags` (query, boolean)
- `search_profiles` (query, boolean)
- `recurrence` (query, string)
- `exclude_tag_id` (query, array)
- `optimized` (query, boolean)

---
##### `getBook`

**GET** `/book`

Get order book summary

**Parameters:**
- `token_id` (query, string) **required**

---
##### `postBooks`

**POST** `/books`

Get multiple order books summaries


---
##### `getPrice`

**GET** `/price`

Get market price

**Parameters:**
- `token_id` (query, string) **required**
- `side` (query, string) **required** — enum: `BUY,SELL`

---
##### `getPrices`

**GET** `/prices`

Get multiple market prices


---
##### `postPrices`

**POST** `/prices`

Get multiple market prices by request


---
##### `getMidpoint`

**GET** `/midpoint`

Get midpoint price

**Parameters:**
- `token_id` (query, string) **required**

---
##### `postSpreads`

**POST** `/spreads`

Get bid-ask spreads


---
##### `getPricesHistory`

**GET** `/prices-history`

Get price history for a traded token

**Parameters:**
- `market` (query, string) **required**
- `startTs` (query, number)
- `endTs` (query, number)
- `interval` (query, string) — enum: `1m,1w,1d,6h,1h,max`
- `fidelity` (query, number)

---
##### `postAuthApiKey`

**POST** `/auth/api-key`

Create API Key *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `getAuthDeriveApiKey`

**GET** `/auth/derive-api-key`

Derive API Key *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `postOrder`

**POST** `/order`

Place Single Order *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `deleteOrder`

**DELETE** `/order`

Cancel Single Order *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `postOrders`

**POST** `/orders`

Place Multiple Orders (Batch) *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `deleteOrders`

**DELETE** `/orders`

Cancel Multiple Orders *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `deleteCancelAll`

**DELETE** `/cancel-all`

Cancel All Orders *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `deleteCancelMarketOrders`

**DELETE** `/cancel-market-orders`

Cancel Market Orders *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `getDataOrder`

**GET** `/data/order/{id}`

Get Order *(Auth required)*

**Parameters:**
- `` (, string)
- `id` (path, string) **required**

---
##### `getDataOrders`

**GET** `/data/orders`

Get Active Orders *(Auth required)*

**Parameters:**
- `` (, string)
- `id` (query, string)
- `market` (query, string)
- `asset_id` (query, string)

---
##### `getDataTrades`

**GET** `/data/trades`

Get Trades *(Auth required)*

**Parameters:**
- `` (, string)
- `id` (query, string)
- `market` (query, string)
- `maker` (query, string)
- `taker` (query, string)
- `before` (query, string)
- `after` (query, string)

---
##### `getOrderScoring`

**GET** `/order-scoring`

Check Order Reward Scoring *(Auth required)*

**Parameters:**
- `` (, string)
- `orderId` (query, string) **required**

---
##### `postOrdersScoring`

**POST** `/orders-scoring`

Check Multiple Orders Scoring *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `getGeoblock`

**GET** `/geoblock`

Check Geoblock Status


---
##### `getDataApiHealth`

**GET** `/`

Data API Health check


---
##### `getPositions`

**GET** `/positions`

Get current positions for a user

**Parameters:**
- `user` (query, string) **required** — User address (required)
- `market` (query, array) — Comma-separated list of condition IDs. Mutually exclusive with eventId.
- `eventId` (query, array) — Comma-separated list of event IDs. Mutually exclusive with market.
- `sizeThreshold` (query, number)
- `redeemable` (query, boolean)
- `mergeable` (query, boolean)
- `limit` (query, integer)
- `offset` (query, integer)
- `sortBy` (query, string) — enum: `CURRENT,INITIAL,TOKENS,CASHPNL,PERCENTPNL,TITLE,RESOLVING,PRICE,AVGPRICE`
- `sortDirection` (query, string) — enum: `ASC,DESC`
- `title` (query, string)

---
##### `getV1AccountingSnapshot`

**GET** `/v1/accounting/snapshot`

Download an accounting snapshot (ZIP of CSVs)

**Parameters:**
- `user` (query, string) **required** — User address (0x-prefixed)

---
##### `getTraded`

**GET** `/traded`

Get total markets a user has traded

**Parameters:**
- `user` (query, string) **required**

---
##### `getOi`

**GET** `/oi`

Get open interest

**Parameters:**
- `market` (query, array)

---
##### `getLiveVolume`

**GET** `/live-volume`

Get live volume for an event

**Parameters:**
- `id` (query, integer) **required**

---
##### `getTrades`

**GET** `/trades`

Get trades for a user or markets

**Parameters:**
- `limit` (query, integer)
- `offset` (query, integer)
- `takerOnly` (query, boolean)
- `filterType` (query, string) — Must be provided together with filterAmount. — enum: `CASH,TOKENS`
- `filterAmount` (query, number) — Must be provided together with filterType.
- `market` (query, array) — Comma-separated list of condition IDs. Mutually exclusive with eventId.
- `eventId` (query, array) — Comma-separated list of event IDs. Mutually exclusive with market.
- `user` (query, string)
- `side` (query, string) — enum: `BUY,SELL`

---
##### `getActivity`

**GET** `/activity`

Get user activity

**Parameters:**
- `limit` (query, integer)
- `offset` (query, integer)
- `user` (query, string) **required**
- `market` (query, array) — Comma-separated list of condition IDs. Mutually exclusive with eventId.
- `eventId` (query, array) — Comma-separated list of event IDs. Mutually exclusive with market.
- `type` (query, array)
- `start` (query, integer)
- `end` (query, integer)
- `sortBy` (query, string) — enum: `TIMESTAMP,TOKENS,CASH`
- `sortDirection` (query, string) — enum: `ASC,DESC`
- `side` (query, string) — enum: `BUY,SELL`

---
##### `getHolders`

**GET** `/holders`

Get top holders for markets

**Parameters:**
- `limit` (query, integer) — Maximum number of holders to return per token. Capped at 20.
- `market` (query, array) **required** — Comma-separated list of condition IDs.
- `minBalance` (query, integer)

---
##### `getValue`

**GET** `/value`

Get total value of a user's positions

**Parameters:**
- `user` (query, string) **required**
- `market` (query, array)

---
##### `getClosedPositions`

**GET** `/closed-positions`

Get closed positions for a user

**Parameters:**
- `user` (query, string) **required** — The address of the user in question
- `market` (query, array) — The conditionId of the market in question. Supports multiple csv separated values. Cannot be used with the eventId param.
- `title` (query, string) — Filter by market title
- `eventId` (query, array) — The event id of the event in question. Supports multiple csv separated values. Returns positions for all markets for those event ids. Cannot be used with the market param.
- `limit` (query, integer) — The max number of positions to return
- `offset` (query, integer) — The starting index for pagination
- `sortBy` (query, string) — The sort criteria — enum: `REALIZEDPNL,TITLE,PRICE,AVGPRICE,TIMESTAMP`
- `sortDirection` (query, string) — The sort direction — enum: `ASC,DESC`

---
##### `getV1MarketPositions`

**GET** `/v1/market-positions`

Get positions for a market

**Parameters:**
- `market` (query, string) **required** — The condition ID of the market to query positions for
- `user` (query, string) — Filter to a single user by proxy wallet address
- `status` (query, string) — Filter positions by status.
- `OPEN` — Only positions with size > 0.01
- `CLOSED` — Only positions with size <= 0.01
- `ALL` — All positions regardless of size
 — enum: `OPEN,CLOSED,ALL`
- `sortBy` (query, string) — Sort positions by:
- `TOKENS` — Position size (number of tokens)
- `CASH_PNL` — Unrealized cash PnL
- `REALIZED_PNL` — Realized PnL
- `TOTAL_PNL` — Total PnL (cash_pnl + realized_pnl)
 — enum: `TOKENS,CASH_PNL,REALIZED_PNL,TOTAL_PNL`
- `sortDirection` (query, string) — enum: `ASC,DESC`
- `limit` (query, integer) — Max number of positions to return per outcome token
- `offset` (query, integer) — Pagination offset per outcome token

---
##### `getV1Leaderboard`

**GET** `/v1/leaderboard`

Get trader leaderboard rankings

**Parameters:**
- `category` (query, string) — Market category for the leaderboard — enum: `OVERALL,POLITICS,SPORTS,CRYPTO,CULTURE,MENTIONS,WEATHER,ECONOMICS,TECH,FINANCE`
- `timePeriod` (query, string) — Time period for leaderboard results — enum: `DAY,WEEK,MONTH,ALL`
- `orderBy` (query, string) — Leaderboard ordering criteria — enum: `PNL,VOL`
- `limit` (query, integer) — Max number of leaderboard traders to return
- `offset` (query, integer) — Starting index for pagination
- `user` (query, string) — Limit leaderboard to a single user by address
- `userName` (query, string) — Limit leaderboard to a single username

---
##### `getV1BuildersLeaderboard`

**GET** `/v1/builders/leaderboard`

Get aggregated builder leaderboard

**Parameters:**
- `timePeriod` (query, string) — The time period to aggregate results over.
 — enum: `DAY,WEEK,MONTH,ALL`
- `limit` (query, string)

---
### Kalshi

| `callApi()` name | Method | Path | Summary | Auth |
|-----------------|--------|------|---------|------|
| `GetHistoricalCutoff` | `GET` | `/historical/cutoff` | Get Historical Cutoff Timestamps | Public |
| `GetMarketCandlesticksHistorical` | `GET` | `/historical/markets/{ticker}/candlesticks` | Get Historical Market Candlesticks | Public |
| `GetFillsHistorical` | `GET` | `/historical/fills` | Get Historical Fills | Required |
| `GetHistoricalOrders` | `GET` | `/historical/orders` | Get Historical Orders | Required |
| `GetHistoricalMarkets` | `GET` | `/historical/markets` | Get Historical Markets | Public |
| `GetHistoricalMarket` | `GET` | `/historical/markets/{ticker}` | Get Historical Market | Public |
| `GetExchangeStatus` | `GET` | `/exchange/status` | Get Exchange Status | Public |
| `GetExchangeAnnouncements` | `GET` | `/exchange/announcements` | Get Exchange Announcements | Public |
| `GetSeriesFeeChanges` | `GET` | `/series/fee_changes` | Get Series Fee Changes | Public |
| `GetExchangeSchedule` | `GET` | `/exchange/schedule` | Get Exchange Schedule | Public |
| `GetUserDataTimestamp` | `GET` | `/exchange/user_data_timestamp` | Get User Data Timestamp | Public |
| `GetOrders` | `GET` | `/portfolio/orders` | Get Orders | Required |
| `CreateOrder` | `POST` | `/portfolio/orders` | Create Order | Required |
| `GetOrder` | `GET` | `/portfolio/orders/{order_id}` | Get Order | Required |
| `CancelOrder` | `DELETE` | `/portfolio/orders/{order_id}` | Cancel Order | Required |
| `BatchCreateOrders` | `POST` | `/portfolio/orders/batched` | Batch Create Orders | Required |
| `BatchCancelOrders` | `DELETE` | `/portfolio/orders/batched` | Batch Cancel Orders | Required |
| `AmendOrder` | `POST` | `/portfolio/orders/{order_id}/amend` | Amend Order | Required |
| `DecreaseOrder` | `POST` | `/portfolio/orders/{order_id}/decrease` | Decrease Order | Required |
| `GetOrderQueuePositions` | `GET` | `/portfolio/orders/queue_positions` | Get Queue Positions for Orders | Required |
| `GetOrderQueuePosition` | `GET` | `/portfolio/orders/{order_id}/queue_position` | Get Order Queue Position | Required |
| `GetOrderGroups` | `GET` | `/portfolio/order_groups` | Get Order Groups | Required |
| `CreateOrderGroup` | `POST` | `/portfolio/order_groups/create` | Create Order Group | Required |
| `GetOrderGroup` | `GET` | `/portfolio/order_groups/{order_group_id}` | Get Order Group | Required |
| `DeleteOrderGroup` | `DELETE` | `/portfolio/order_groups/{order_group_id}` | Delete Order Group | Required |
| `ResetOrderGroup` | `PUT` | `/portfolio/order_groups/{order_group_id}/reset` | Reset Order Group | Required |
| `TriggerOrderGroup` | `PUT` | `/portfolio/order_groups/{order_group_id}/trigger` | Trigger Order Group | Required |
| `UpdateOrderGroupLimit` | `PUT` | `/portfolio/order_groups/{order_group_id}/limit` | Update Order Group Limit | Required |
| `GetBalance` | `GET` | `/portfolio/balance` | Get Balance | Required |
| `CreateSubaccount` | `POST` | `/portfolio/subaccounts` | Create Subaccount | Required |
| `ApplySubaccountTransfer` | `POST` | `/portfolio/subaccounts/transfer` | Transfer Between Subaccounts | Required |
| `GetSubaccountBalances` | `GET` | `/portfolio/subaccounts/balances` | Get All Subaccount Balances | Required |
| `GetSubaccountTransfers` | `GET` | `/portfolio/subaccounts/transfers` | Get Subaccount Transfers | Required |
| `GetPositions` | `GET` | `/portfolio/positions` | Get Positions | Required |
| `GetSettlements` | `GET` | `/portfolio/settlements` | Get Settlements | Required |
| `GetPortfolioRestingOrderTotalValue` | `GET` | `/portfolio/summary/total_resting_order_value` | Get Total Resting Order Value | Required |
| `GetFills` | `GET` | `/portfolio/fills` | Get Fills | Required |
| `GetApiKeys` | `GET` | `/api_keys` | Get API Keys | Required |
| `CreateApiKey` | `POST` | `/api_keys` | Create API Key | Required |
| `GenerateApiKey` | `POST` | `/api_keys/generate` | Generate API Key | Required |
| `DeleteApiKey` | `DELETE` | `/api_keys/{api_key}` | Delete API Key | Required |
| `GetTagsForSeriesCategories` | `GET` | `/search/tags_by_categories` | Get Tags for Series Categories | Public |
| `GetFiltersForSports` | `GET` | `/search/filters_by_sport` | Get Filters for Sports | Public |
| `GetAccountApiLimits` | `GET` | `/account/limits` | Get Account API Limits | Required |
| `GetMarketCandlesticks` | `GET` | `/series/{series_ticker}/markets/{ticker}/candlesticks` | Get Market Candlesticks | Public |
| `GetTrades` | `GET` | `/markets/trades` | Get Trades | Public |
| `GetMarketCandlesticksByEvent` | `GET` | `/series/{series_ticker}/events/{ticker}/candlesticks` | Get Event Candlesticks | Public |
| `GetEvents` | `GET` | `/events` | Get Events | Public |
| `GetMultivariateEvents` | `GET` | `/events/multivariate` | Get Multivariate Events | Public |
| `GetEvent` | `GET` | `/events/{event_ticker}` | Get Event | Public |
| `GetEventMetadata` | `GET` | `/events/{event_ticker}/metadata` | Get Event Metadata | Public |
| `GetEventForecastPercentilesHistory` | `GET` | `/series/{series_ticker}/events/{ticker}/forecast_percentile_history` | Get Event Forecast Percentile History | Required |
| `GetLiveData` | `GET` | `/live_data/{type}/milestone/{milestone_id}` | Get Live Data | Public |
| `GetLiveDatas` | `GET` | `/live_data/batch` | Get Multiple Live Data | Public |
| `GetIncentivePrograms` | `GET` | `/incentive_programs` | Get Incentives | Public |
| `GetFCMOrders` | `GET` | `/fcm/orders` | Get FCM Orders | Required |
| `GetFCMPositions` | `GET` | `/fcm/positions` | Get FCM Positions | Required |
| `GetStructuredTargets` | `GET` | `/structured_targets` | Get Structured Targets | Public |
| `GetStructuredTarget` | `GET` | `/structured_targets/{structured_target_id}` | Get Structured Target | Public |
| `GetMarketOrderbook` | `GET` | `/markets/{ticker}/orderbook` | Get Market Orderbook | Required |
| `GetMilestone` | `GET` | `/milestones/{milestone_id}` | Get Milestone | Public |
| `GetMilestones` | `GET` | `/milestones` | Get Milestones | Public |
| `GetCommunicationsID` | `GET` | `/communications/id` | Get Communications ID | Required |
| `GetRFQs` | `GET` | `/communications/rfqs` | Get RFQs | Required |
| `CreateRFQ` | `POST` | `/communications/rfqs` | Create RFQ | Required |
| `GetRFQ` | `GET` | `/communications/rfqs/{rfq_id}` | Get RFQ | Required |
| `DeleteRFQ` | `DELETE` | `/communications/rfqs/{rfq_id}` | Delete RFQ | Required |
| `GetQuotes` | `GET` | `/communications/quotes` | Get Quotes | Required |
| `CreateQuote` | `POST` | `/communications/quotes` | Create Quote | Required |
| `GetQuote` | `GET` | `/communications/quotes/{quote_id}` | Get Quote | Required |
| `DeleteQuote` | `DELETE` | `/communications/quotes/{quote_id}` | Delete Quote | Required |
| `AcceptQuote` | `PUT` | `/communications/quotes/{quote_id}/accept` | Accept Quote | Required |
| `ConfirmQuote` | `PUT` | `/communications/quotes/{quote_id}/confirm` | Confirm Quote | Required |
| `GetMultivariateEventCollection` | `GET` | `/multivariate_event_collections/{collection_ticker}` | Get Multivariate Event Collection | Public |
| `CreateMarketInMultivariateEventCollection` | `POST` | `/multivariate_event_collections/{collection_ticker}` | Create Market In Multivariate Event Collection | Required |
| `GetMultivariateEventCollections` | `GET` | `/multivariate_event_collections` | Get Multivariate Event Collections | Public |
| `LookupTickersForMarketInMultivariateEventCollection` | `PUT` | `/multivariate_event_collections/{collection_ticker}/lookup` | Lookup Tickers For Market In Multivariate Event Collection | Required |
| `GetMultivariateEventCollectionLookupHistory` | `GET` | `/multivariate_event_collections/{collection_ticker}/lookup` | Get Multivariate Event Collection Lookup History | Public |
| `GetSeries` | `GET` | `/series/{series_ticker}` | Get Series | Public |
| `GetSeriesList` | `GET` | `/series` | Get Series List | Public |
| `GetMarkets` | `GET` | `/markets` | Get Markets | Public |
| `GetMarket` | `GET` | `/markets/{ticker}` | Get Market | Public |
| `BatchGetMarketCandlesticks` | `GET` | `/markets/candlesticks` | Batch Get Market Candlesticks | Public |

#### Endpoint Details

##### `GetHistoricalCutoff`

**GET** `/historical/cutoff`

Get Historical Cutoff Timestamps


---
##### `GetMarketCandlesticksHistorical`

**GET** `/historical/markets/{ticker}/candlesticks`

Get Historical Market Candlesticks

**Parameters:**
- `ticker` (path, string) **required** — Market ticker - unique identifier for the specific market
- `start_ts` (query, integer) **required** — Start timestamp (Unix timestamp). Candlesticks will include those ending on or after this time.
- `end_ts` (query, integer) **required** — End timestamp (Unix timestamp). Candlesticks will include those ending on or before this time.
- `period_interval` (query, integer) **required** — Time period length of each candlestick in minutes. Valid values are 1 (1 minute), 60 (1 hour), or 1440 (1 day). — enum: `1,60,1440`

---
##### `GetFillsHistorical`

**GET** `/historical/fills`

Get Historical Fills *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetHistoricalOrders`

**GET** `/historical/orders`

Get Historical Orders *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetHistoricalMarkets`

**GET** `/historical/markets`

Get Historical Markets

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetHistoricalMarket`

**GET** `/historical/markets/{ticker}`

Get Historical Market

**Parameters:**
- `` (, string)

---
##### `GetExchangeStatus`

**GET** `/exchange/status`

Get Exchange Status


---
##### `GetExchangeAnnouncements`

**GET** `/exchange/announcements`

Get Exchange Announcements


---
##### `GetSeriesFeeChanges`

**GET** `/series/fee_changes`

Get Series Fee Changes

**Parameters:**
- `series_ticker` (query, string)
- `show_historical` (query, boolean)

---
##### `GetExchangeSchedule`

**GET** `/exchange/schedule`

Get Exchange Schedule


---
##### `GetUserDataTimestamp`

**GET** `/exchange/user_data_timestamp`

Get User Data Timestamp


---
##### `GetOrders`

**GET** `/portfolio/orders`

Get Orders *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `CreateOrder`

**POST** `/portfolio/orders`

Create Order *(Auth required)*


---
##### `GetOrder`

**GET** `/portfolio/orders/{order_id}`

Get Order *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `CancelOrder`

**DELETE** `/portfolio/orders/{order_id}`

Cancel Order *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)

---
##### `BatchCreateOrders`

**POST** `/portfolio/orders/batched`

Batch Create Orders *(Auth required)*


---
##### `BatchCancelOrders`

**DELETE** `/portfolio/orders/batched`

Batch Cancel Orders *(Auth required)*


---
##### `AmendOrder`

**POST** `/portfolio/orders/{order_id}/amend`

Amend Order *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `DecreaseOrder`

**POST** `/portfolio/orders/{order_id}/decrease`

Decrease Order *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `GetOrderQueuePositions`

**GET** `/portfolio/orders/queue_positions`

Get Queue Positions for Orders *(Auth required)*

**Parameters:**
- `market_tickers` (query, string) — Comma-separated list of market tickers to filter by
- `event_ticker` (query, string) — Event ticker to filter by
- `` (, string)

---
##### `GetOrderQueuePosition`

**GET** `/portfolio/orders/{order_id}/queue_position`

Get Order Queue Position *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `GetOrderGroups`

**GET** `/portfolio/order_groups`

Get Order Groups *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `CreateOrderGroup`

**POST** `/portfolio/order_groups/create`

Create Order Group *(Auth required)*


---
##### `GetOrderGroup`

**GET** `/portfolio/order_groups/{order_group_id}`

Get Order Group *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)

---
##### `DeleteOrderGroup`

**DELETE** `/portfolio/order_groups/{order_group_id}`

Delete Order Group *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)

---
##### `ResetOrderGroup`

**PUT** `/portfolio/order_groups/{order_group_id}/reset`

Reset Order Group *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)

---
##### `TriggerOrderGroup`

**PUT** `/portfolio/order_groups/{order_group_id}/trigger`

Trigger Order Group *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)

---
##### `UpdateOrderGroupLimit`

**PUT** `/portfolio/order_groups/{order_group_id}/limit`

Update Order Group Limit *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `GetBalance`

**GET** `/portfolio/balance`

Get Balance *(Auth required)*


---
##### `CreateSubaccount`

**POST** `/portfolio/subaccounts`

Create Subaccount *(Auth required)*


---
##### `ApplySubaccountTransfer`

**POST** `/portfolio/subaccounts/transfer`

Transfer Between Subaccounts *(Auth required)*


---
##### `GetSubaccountBalances`

**GET** `/portfolio/subaccounts/balances`

Get All Subaccount Balances *(Auth required)*


---
##### `GetSubaccountTransfers`

**GET** `/portfolio/subaccounts/transfers`

Get Subaccount Transfers *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)

---
##### `GetPositions`

**GET** `/portfolio/positions`

Get Positions *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetSettlements`

**GET** `/portfolio/settlements`

Get Settlements *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetPortfolioRestingOrderTotalValue`

**GET** `/portfolio/summary/total_resting_order_value`

Get Total Resting Order Value *(Auth required)*


---
##### `GetFills`

**GET** `/portfolio/fills`

Get Fills *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetApiKeys`

**GET** `/api_keys`

Get API Keys *(Auth required)*


---
##### `CreateApiKey`

**POST** `/api_keys`

Create API Key *(Auth required)*


---
##### `GenerateApiKey`

**POST** `/api_keys/generate`

Generate API Key *(Auth required)*


---
##### `DeleteApiKey`

**DELETE** `/api_keys/{api_key}`

Delete API Key *(Auth required)*

**Parameters:**
- `api_key` (path, string) **required** — API key ID to delete

---
##### `GetTagsForSeriesCategories`

**GET** `/search/tags_by_categories`

Get Tags for Series Categories


---
##### `GetFiltersForSports`

**GET** `/search/filters_by_sport`

Get Filters for Sports


---
##### `GetAccountApiLimits`

**GET** `/account/limits`

Get Account API Limits *(Auth required)*


---
##### `GetMarketCandlesticks`

**GET** `/series/{series_ticker}/markets/{ticker}/candlesticks`

Get Market Candlesticks

**Parameters:**
- `series_ticker` (path, string) **required** — Series ticker - the series that contains the target market
- `ticker` (path, string) **required** — Market ticker - unique identifier for the specific market
- `start_ts` (query, integer) **required** — Start timestamp (Unix timestamp). Candlesticks will include those ending on or after this time.
- `end_ts` (query, integer) **required** — End timestamp (Unix timestamp). Candlesticks will include those ending on or before this time.
- `period_interval` (query, integer) **required** — Time period length of each candlestick in minutes. Valid values are 1 (1 minute), 60 (1 hour), or 1440 (1 day). — enum: `1,60,1440`
- `include_latest_before_start` (query, boolean) — If true, prepends the latest candlestick available before the start_ts. This synthetic candlestick is created by:
1. Finding the most recent real candlestick before start_ts
2. Projecting it forward to the first period boundary (calculated as the next period interval after start_ts)
3. Setting all OHLC prices to null, and `previous_price` to the close price from the real candlestick


---
##### `GetTrades`

**GET** `/markets/trades`

Get Trades

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetMarketCandlesticksByEvent`

**GET** `/series/{series_ticker}/events/{ticker}/candlesticks`

Get Event Candlesticks

**Parameters:**
- `ticker` (path, string) **required** — The event ticker
- `series_ticker` (path, string) **required** — The series ticker
- `start_ts` (query, integer) **required** — Start timestamp for the range
- `end_ts` (query, integer) **required** — End timestamp for the range
- `period_interval` (query, integer) **required** — Specifies the length of each candlestick period, in minutes. Must be one minute, one hour, or one day. — enum: `1,60,1440`

---
##### `GetEvents`

**GET** `/events`

Get Events

**Parameters:**
- `limit` (query, integer) — Parameter to specify the number of results per page. Defaults to 200. Maximum value is 200.
- `cursor` (query, string) — Parameter to specify the pagination cursor. Use the cursor value returned from the previous response to get the next page of results. Leave empty for the first page.
- `with_nested_markets` (query, boolean) — Parameter to specify if nested markets should be included in the response. When true, each event will include a 'markets' field containing a list of Market objects associated with that event.
- `with_milestones` (query, boolean) — If true, includes related milestones as a field alongside events.
- `status` (query, string) — Filter by event status. Possible values are 'open', 'closed', 'settled'. Leave empty to return events with any status. — enum: `open,closed,settled`
- `` (, string)
- `min_close_ts` (query, integer) — Filter events with at least one market with close timestamp greater than this Unix timestamp (in seconds).

---
##### `GetMultivariateEvents`

**GET** `/events/multivariate`

Get Multivariate Events

**Parameters:**
- `limit` (query, integer) — Number of results per page. Defaults to 100. Maximum value is 200.
- `cursor` (query, string) — Pagination cursor. Use the cursor value returned from the previous response to get the next page of results.
- `` (, string)
- `collection_ticker` (query, string) — Filter events by collection ticker. Returns only multivariate events belonging to the specified collection. Cannot be used together with series_ticker.
- `with_nested_markets` (query, boolean) — Parameter to specify if nested markets should be included in the response. When true, each event will include a 'markets' field containing a list of Market objects associated with that event.

---
##### `GetEvent`

**GET** `/events/{event_ticker}`

Get Event

**Parameters:**
- `event_ticker` (path, string) **required** — Event ticker
- `with_nested_markets` (query, boolean) — If true, markets are included within the event object. If false (default), markets are returned as a separate top-level field in the response.

---
##### `GetEventMetadata`

**GET** `/events/{event_ticker}/metadata`

Get Event Metadata

**Parameters:**
- `event_ticker` (path, string) **required** — Event ticker

---
##### `GetEventForecastPercentilesHistory`

**GET** `/series/{series_ticker}/events/{ticker}/forecast_percentile_history`

Get Event Forecast Percentile History *(Auth required)*

**Parameters:**
- `ticker` (path, string) **required** — The event ticker
- `series_ticker` (path, string) **required** — The series ticker
- `percentiles` (query, array) **required** — Array of percentile values to retrieve (0-10000, max 10 values)
- `start_ts` (query, integer) **required** — Start timestamp for the range
- `end_ts` (query, integer) **required** — End timestamp for the range
- `period_interval` (query, integer) **required** — Specifies the length of each forecast period, in minutes. 0 for 5-second intervals, or 1, 60, or 1440 for minute-based intervals. — enum: `0,1,60,1440`

---
##### `GetLiveData`

**GET** `/live_data/{type}/milestone/{milestone_id}`

Get Live Data

**Parameters:**
- `type` (path, string) **required** — Type of live data
- `milestone_id` (path, string) **required** — Milestone ID

---
##### `GetLiveDatas`

**GET** `/live_data/batch`

Get Multiple Live Data

**Parameters:**
- `milestone_ids` (query, array) **required** — Array of milestone IDs

---
##### `GetIncentivePrograms`

**GET** `/incentive_programs`

Get Incentives

**Parameters:**
- `status` (query, string) — Status filter. Can be "all", "active", "upcoming", "closed", or "paid_out". Default is "all". — enum: `all,active,upcoming,closed,paid_out`
- `type` (query, string) — Type filter. Can be "all", "liquidity", or "volume". Default is "all". — enum: `all,liquidity,volume`
- `limit` (query, integer) — Number of results per page. Defaults to 100. Maximum value is 10000.
- `cursor` (query, string) — Cursor for pagination

---
##### `GetFCMOrders`

**GET** `/fcm/orders`

Get FCM Orders *(Auth required)*

**Parameters:**
- `subtrader_id` (query, string) **required** — Restricts the response to orders for a specific subtrader (FCM members only)
- `` (, string)
- `` (, string)
- `` (, string)
- `min_ts` (query, integer) — Restricts the response to orders after a timestamp, formatted as a Unix Timestamp
- `max_ts` (query, integer) — Restricts the response to orders before a timestamp, formatted as a Unix Timestamp
- `status` (query, string) — Restricts the response to orders that have a certain status — enum: `resting,canceled,executed`
- `limit` (query, integer) — Parameter to specify the number of results per page. Defaults to 100

---
##### `GetFCMPositions`

**GET** `/fcm/positions`

Get FCM Positions *(Auth required)*

**Parameters:**
- `subtrader_id` (query, string) **required** — Restricts the response to positions for a specific subtrader (FCM members only)
- `ticker` (query, string) — Ticker of desired positions
- `event_ticker` (query, string) — Event ticker of desired positions
- `count_filter` (query, string) — Restricts the positions to those with any of following fields with non-zero values, as a comma separated list
- `settlement_status` (query, string) — Settlement status of the markets to return. Defaults to unsettled — enum: `all,unsettled,settled`
- `limit` (query, integer) — Parameter to specify the number of results per page. Defaults to 100
- `cursor` (query, string) — The Cursor represents a pointer to the next page of records in the pagination

---
##### `GetStructuredTargets`

**GET** `/structured_targets`

Get Structured Targets

**Parameters:**
- `type` (query, string) — Filter by structured target type
- `competition` (query, string) — Filter by competition
- `page_size` (query, integer) — Number of items per page (min 1, max 2000, default 100)
- `cursor` (query, string) — Pagination cursor

---
##### `GetStructuredTarget`

**GET** `/structured_targets/{structured_target_id}`

Get Structured Target

**Parameters:**
- `structured_target_id` (path, string) **required** — Structured target ID

---
##### `GetMarketOrderbook`

**GET** `/markets/{ticker}/orderbook`

Get Market Orderbook *(Auth required)*

**Parameters:**
- `` (, string)
- `depth` (query, integer) — Depth of the orderbook to retrieve (0 or negative means all levels, 1-100 for specific depth)

---
##### `GetMilestone`

**GET** `/milestones/{milestone_id}`

Get Milestone

**Parameters:**
- `milestone_id` (path, string) **required** — Milestone ID

---
##### `GetMilestones`

**GET** `/milestones`

Get Milestones

**Parameters:**
- `limit` (query, integer) **required** — Number of milestones to return per page
- `minimum_start_date` (query, string) — Minimum start date to filter milestones. Format RFC3339 timestamp
- `category` (query, string) — Filter by milestone category
- `competition` (query, string) — Filter by competition
- `source_id` (query, string) — Filter by source id
- `type` (query, string) — Filter by milestone type
- `related_event_ticker` (query, string) — Filter by related event ticker
- `cursor` (query, string) — Pagination cursor. Use the cursor value returned from the previous response to get the next page of results

---
##### `GetCommunicationsID`

**GET** `/communications/id`

Get Communications ID *(Auth required)*


---
##### `GetRFQs`

**GET** `/communications/rfqs`

Get RFQs *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `limit` (query, integer) — Parameter to specify the number of results per page. Defaults to 100.
- `status` (query, string) — Filter RFQs by status
- `creator_user_id` (query, string) — Filter RFQs by creator user ID

---
##### `CreateRFQ`

**POST** `/communications/rfqs`

Create RFQ *(Auth required)*


---
##### `GetRFQ`

**GET** `/communications/rfqs/{rfq_id}`

Get RFQ *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `DeleteRFQ`

**DELETE** `/communications/rfqs/{rfq_id}`

Delete RFQ *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `GetQuotes`

**GET** `/communications/quotes`

Get Quotes *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `limit` (query, integer) — Parameter to specify the number of results per page. Defaults to 500.
- `status` (query, string) — Filter quotes by status
- `quote_creator_user_id` (query, string) — Filter quotes by quote creator user ID
- `rfq_creator_user_id` (query, string) — Filter quotes by RFQ creator user ID
- `rfq_creator_subtrader_id` (query, string) — Filter quotes by RFQ creator subtrader ID (FCM members only)
- `rfq_id` (query, string) — Filter quotes by RFQ ID

---
##### `CreateQuote`

**POST** `/communications/quotes`

Create Quote *(Auth required)*


---
##### `GetQuote`

**GET** `/communications/quotes/{quote_id}`

Get Quote *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `DeleteQuote`

**DELETE** `/communications/quotes/{quote_id}`

Delete Quote *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `AcceptQuote`

**PUT** `/communications/quotes/{quote_id}/accept`

Accept Quote *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `ConfirmQuote`

**PUT** `/communications/quotes/{quote_id}/confirm`

Confirm Quote *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `GetMultivariateEventCollection`

**GET** `/multivariate_event_collections/{collection_ticker}`

Get Multivariate Event Collection

**Parameters:**
- `collection_ticker` (path, string) **required** — Collection ticker

---
##### `CreateMarketInMultivariateEventCollection`

**POST** `/multivariate_event_collections/{collection_ticker}`

Create Market In Multivariate Event Collection *(Auth required)*

**Parameters:**
- `collection_ticker` (path, string) **required** — Collection ticker

---
##### `GetMultivariateEventCollections`

**GET** `/multivariate_event_collections`

Get Multivariate Event Collections

**Parameters:**
- `status` (query, string) — Only return collections of a certain status. Can be unopened, open, or closed. — enum: `unopened,open,closed`
- `associated_event_ticker` (query, string) — Only return collections associated with a particular event ticker.
- `series_ticker` (query, string) — Only return collections with a particular series ticker.
- `limit` (query, integer) — Specify the maximum number of results.
- `cursor` (query, string) — The Cursor represents a pointer to the next page of records in the pagination. This optional parameter, when filled, should be filled with the cursor string returned in a previous request to this end-point.

---
##### `LookupTickersForMarketInMultivariateEventCollection`

**PUT** `/multivariate_event_collections/{collection_ticker}/lookup`

Lookup Tickers For Market In Multivariate Event Collection *(Auth required)*

**Parameters:**
- `collection_ticker` (path, string) **required** — Collection ticker

---
##### `GetMultivariateEventCollectionLookupHistory`

**GET** `/multivariate_event_collections/{collection_ticker}/lookup`

Get Multivariate Event Collection Lookup History

**Parameters:**
- `collection_ticker` (path, string) **required** — Collection ticker
- `lookback_seconds` (query, integer) **required** — Number of seconds to look back for lookup history. Must be one of 10, 60, 300, or 3600. — enum: `10,60,300,3600`

---
##### `GetSeries`

**GET** `/series/{series_ticker}`

Get Series

**Parameters:**
- `series_ticker` (path, string) **required** — The ticker of the series to retrieve
- `include_volume` (query, boolean) — If true, includes the total volume traded across all events in this series.

---
##### `GetSeriesList`

**GET** `/series`

Get Series List

**Parameters:**
- `category` (query, string)
- `tags` (query, string)
- `include_product_metadata` (query, boolean)
- `include_volume` (query, boolean) — If true, includes the total volume traded across all events in each series.

---
##### `GetMarkets`

**GET** `/markets`

Get Markets

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetMarket`

**GET** `/markets/{ticker}`

Get Market

**Parameters:**
- `` (, string)

---
##### `BatchGetMarketCandlesticks`

**GET** `/markets/candlesticks`

Batch Get Market Candlesticks

**Parameters:**
- `market_tickers` (query, string) **required** — Comma-separated list of market tickers (maximum 100)
- `start_ts` (query, integer) **required** — Start timestamp in Unix seconds
- `end_ts` (query, integer) **required** — End timestamp in Unix seconds
- `period_interval` (query, integer) **required** — Candlestick period interval in minutes
- `include_latest_before_start` (query, boolean) — If true, prepends the latest candlestick available before the start_ts. This synthetic candlestick is created by:
1. Finding the most recent real candlestick before start_ts
2. Projecting it forward to the first period boundary (calculated as the next period interval after start_ts)
3. Setting all OHLC prices to null, and `previous_price` to the close price from the real candlestick


---
### Limitless

| `callApi()` name | Method | Path | Summary | Auth |
|-----------------|--------|------|---------|------|
| `AuthController_getSigningMessage` | `GET` | `/auth/signing-message` | Get signing message | Public |
| `AuthController_verifyAuth` | `GET` | `/auth/verify-auth` | Verify authentication | Required |
| `AuthController_login` | `POST` | `/auth/login` | User login | Public |
| `AuthController_logout` | `POST` | `/auth/logout` | User logout | Required |
| `MarketController_getActiveMarkets[0]` | `GET` | `/markets/active/{categoryId}` | Browse Active Markets | Public |
| `MarketController_getActiveMarkets[1]` | `GET` | `/markets/active` | Browse Active Markets | Public |
| `MarketController_getActiveMarketCountPerCategory` | `GET` | `/markets/categories/count` | Get active market count per category | Public |
| `MarketController_getActiveSlugs` | `GET` | `/markets/active/slugs` | Get active market slugs with metadata | Public |
| `MarketController_find` | `GET` | `/markets/{addressOrSlug}` | Get Market Details | Public |
| `MarketController_getFeedEvent` | `GET` | `/markets/{slug}/get-feed-events` | Get feed events for a market | Required |
| `MarketOrderbookController_getHistoricalPrice` | `GET` | `/markets/{slug}/historical-price` | Get Historical Prices | Public |
| `MarketOrderbookController_getOrderbook` | `GET` | `/markets/{slug}/orderbook` | Get Orderbook | Public |
| `MarketOrderbookController_getLockedBalance` | `GET` | `/markets/{slug}/locked-balance` | Get Locked Balance | Required |
| `MarketOrderbookController_getUserOrders` | `GET` | `/markets/{slug}/user-orders` | User Orders | Required |
| `MarketOrderbookController_getMarketEvents` | `GET` | `/markets/{slug}/events` | Market Events | Public |
| `MarketSearchController_search` | `GET` | `/markets/search` | Search for markets based on semantic similarity | Public |
| `PortfolioController_getTrades` | `GET` | `/portfolio/trades` | Get Trades | Required |
| `PortfolioController_getPositions` | `GET` | `/portfolio/positions` | Get Positions | Required |
| `PortfolioController_getPnlChart` | `GET` | `/portfolio/pnl-chart` | Get portfolio PnL chart | Required |
| `PortfolioController_getHistory` | `GET` | `/portfolio/history` | Get History | Required |
| `PortfolioController_getPointsBreakdown` | `GET` | `/portfolio/points` | Get points breakdown | Required |
| `PublicPortfolioController_tradedVolume` | `GET` | `/portfolio/{account}/traded-volume` | User Total Volume | Public |
| `PublicPortfolioController_getPositions` | `GET` | `/portfolio/{account}/positions` | Get All User Positions | Public |
| `PublicPortfolioController_getPnlChart` | `GET` | `/portfolio/{account}/pnl-chart` | Get portfolio PnL chart (public) | Public |
| `TradingPortfolioController_getAllowance` | `GET` | `/portfolio/trading/allowance` | Get User Trading Allowance | Required |
| `OrderController_createOrder` | `POST` | `/orders` | Create Order | Required |
| `OrderController_cancelOrder` | `DELETE` | `/orders/{orderId}` | Cancel Order | Required |
| `OrderController_cancelOrderBatch` | `POST` | `/orders/cancel-batch` | Cancel multiple orders in batch | Required |
| `OrderController_cancelAllOrders` | `DELETE` | `/orders/all/{slug}` | Cancel all of a user's orders in a specific market | Required |

#### Endpoint Details

##### `AuthController_getSigningMessage`

**GET** `/auth/signing-message`

Get signing message


---
##### `AuthController_verifyAuth`

**GET** `/auth/verify-auth`

Verify authentication *(Auth required)*


---
##### `AuthController_login`

**POST** `/auth/login`

User login

**Parameters:**
- `x-account` (header, string) **required** — The Ethereum address of the user
- `x-signing-message` (header, string) **required** — The signing message generated by the server
- `x-signature` (header, string) **required** — The signature generated by signing the message with the user's wallet

---
##### `AuthController_logout`

**POST** `/auth/logout`

User logout *(Auth required)*


---
##### `MarketController_getActiveMarkets[0]`

**GET** `/markets/active/{categoryId}`

Browse Active Markets

**Parameters:**
- `page` (query, number) — Page number for pagination
- `limit` (query, number) — Number of items per page
- `sortBy` (query, string) — Sort by query parameter
- `tradeType` (query, string) — Filter by trade type (amm, clob, or group) — enum: `amm,clob,group`
- `automationType` (query, string) — Filter by automation type (manual, lumy, or sports) — enum: `manual,lumy,sports`
- `categoryId` (path, number) **required** — Filter markets by category ID

---
##### `MarketController_getActiveMarkets[1]`

**GET** `/markets/active`

Browse Active Markets

**Parameters:**
- `page` (query, number) — Page number for pagination
- `limit` (query, number) — Number of items per page
- `sortBy` (query, string) — Sort by query parameter
- `tradeType` (query, string) — Filter by trade type (amm, clob, or group) — enum: `amm,clob,group`
- `automationType` (query, string) — Filter by automation type (manual, lumy, or sports) — enum: `manual,lumy,sports`
- `categoryId` (path, number) **required** — Filter markets by category ID

---
##### `MarketController_getActiveMarketCountPerCategory`

**GET** `/markets/categories/count`

Get active market count per category


---
##### `MarketController_getActiveSlugs`

**GET** `/markets/active/slugs`

Get active market slugs with metadata


---
##### `MarketController_find`

**GET** `/markets/{addressOrSlug}`

Get Market Details

**Parameters:**
- `addressOrSlug` (path, string) **required** — Market/group address (0x...) or slug identifier (my-market-name)

---
##### `MarketController_getFeedEvent`

**GET** `/markets/{slug}/get-feed-events`

Get feed events for a market *(Auth required)*

**Parameters:**
- `page` (query, number) — Page number for pagination
- `limit` (query, number) — Number of events per page
- `slug` (path, string) **required** — Slug of the market

---
##### `MarketOrderbookController_getHistoricalPrice`

**GET** `/markets/{slug}/historical-price`

Get Historical Prices

**Parameters:**
- `to` (query, string) — End date for historical data
- `from` (query, string) — Start date for historical data
- `interval` (query, string) — Time interval for data points — enum: `1h,6h,1d,1w,1m,all`
- `slug` (path, string) **required** — Market slug identifier

---
##### `MarketOrderbookController_getOrderbook`

**GET** `/markets/{slug}/orderbook`

Get Orderbook

**Parameters:**
- `slug` (path, string) **required** — Market slug identifier

---
##### `MarketOrderbookController_getLockedBalance`

**GET** `/markets/{slug}/locked-balance`

Get Locked Balance *(Auth required)*

**Parameters:**
- `slug` (path, string) **required** — Market slug identifier

---
##### `MarketOrderbookController_getUserOrders`

**GET** `/markets/{slug}/user-orders`

User Orders *(Auth required)*

**Parameters:**
- `statuses` (query, array) — Order status(es) to filter by. Defaults to [LIVE] if not provided
- `limit` (query, number) — Maximum number of orders to return
- `slug` (path, string) **required** — Market slug identifier

---
##### `MarketOrderbookController_getMarketEvents`

**GET** `/markets/{slug}/events`

Market Events

**Parameters:**
- `page` (query, number) — Page number for pagination
- `limit` (query, number) — Number of events per page
- `slug` (path, string) **required** — Market slug identifier

---
##### `MarketSearchController_search`

**GET** `/markets/search`

Search for markets based on semantic similarity

**Parameters:**
- `query` (query, string) **required** — Search query text
- `limit` (query, number) — Maximum number of results to return
- `page` (query, number) — Number of page
- `similarityThreshold` (query, number) — Minimum similarity score (0-1)

---
##### `PortfolioController_getTrades`

**GET** `/portfolio/trades`

Get Trades *(Auth required)*


---
##### `PortfolioController_getPositions`

**GET** `/portfolio/positions`

Get Positions *(Auth required)*


---
##### `PortfolioController_getPnlChart`

**GET** `/portfolio/pnl-chart`

Get portfolio PnL chart *(Auth required)*

**Parameters:**
- `timeframe` (query, string) — Timeframe window for percent change and chart series

---
##### `PortfolioController_getHistory`

**GET** `/portfolio/history`

Get History *(Auth required)*

**Parameters:**
- `page` (query, number) **required** — Page number
- `limit` (query, number) **required** — Number of items per page
- `from` (query, string) — Start date for filtering (ISO 8601 format)
- `to` (query, string) — End date for filtering (ISO 8601 format)

---
##### `PortfolioController_getPointsBreakdown`

**GET** `/portfolio/points`

Get points breakdown *(Auth required)*


---
##### `PublicPortfolioController_tradedVolume`

**GET** `/portfolio/{account}/traded-volume`

User Total Volume

**Parameters:**
- `account` (path, string) **required** — User Ethereum address

---
##### `PublicPortfolioController_getPositions`

**GET** `/portfolio/{account}/positions`

Get All User Positions

**Parameters:**
- `account` (path, string) **required** — User Ethereum address

---
##### `PublicPortfolioController_getPnlChart`

**GET** `/portfolio/{account}/pnl-chart`

Get portfolio PnL chart (public)

**Parameters:**
- `account` (path, string) **required** — User Ethereum address
- `timeframe` (query, string) — Timeframe window for percent change and chart series

---
##### `TradingPortfolioController_getAllowance`

**GET** `/portfolio/trading/allowance`

Get User Trading Allowance *(Auth required)*

**Parameters:**
- `type` (query, string) **required** — Trading type: CLOB or NegRisk — enum: `clob,negrisk`
- `spender` (query, string) — Optional spender address override (e.g., venue exchange address)

---
##### `OrderController_createOrder`

**POST** `/orders`

Create Order *(Auth required)*


---
##### `OrderController_cancelOrder`

**DELETE** `/orders/{orderId}`

Cancel Order *(Auth required)*

**Parameters:**
- `orderId` (path, string) **required** — Unique identifier of the order to be cancelled

---
##### `OrderController_cancelOrderBatch`

**POST** `/orders/cancel-batch`

Cancel multiple orders in batch *(Auth required)*


---
##### `OrderController_cancelAllOrders`

**DELETE** `/orders/all/{slug}`

Cancel all of a user's orders in a specific market *(Auth required)*


---
### Probable

| `callApi()` name | Method | Path | Summary | Auth |
|-----------------|--------|------|---------|------|
| `getPublicApiV1AuthNonce` | `GET` | `/public/api/v1/auth/nonce` | Generate Nonce | Public |
| `postPublicApiV1AuthLogin` | `POST` | `/public/api/v1/auth/login` | Login | Public |
| `postPublicApiV1AuthLogout` | `POST` | `/public/api/v1/auth/logout` | Logout | Public |
| `postPublicApiV1AuthApiKey` | `POST` | `/public/api/v1/auth/api-key/{chainId}` | Generate API Key | Required |
| `getPublicApiV1AuthApiKey` | `GET` | `/public/api/v1/auth/api-key/{chainId}` | Get API Key | Required |
| `deletePublicApiV1AuthApiKey` | `DELETE` | `/public/api/v1/auth/api-key/{chainId}` | Delete API Key | Required |
| `postPublicApiV1AuthVerifyL1` | `POST` | `/public/api/v1/auth/verify/l1` | Verify L1 Headers | Required |
| `postPublicApiV1AuthVerifyL2` | `POST` | `/public/api/v1/auth/verify/l2` | Verify L2 Headers | Required |
| `getPublicApiV1Events` | `GET` | `/public/api/v1/events/` | List All Events | Public |
| `getPublicApiV1Events` | `GET` | `/public/api/v1/events/{id}` | Get Event by ID | Public |
| `getPublicApiV1EventsSlug` | `GET` | `/public/api/v1/events/slug/{slug}` | Get Event by Slug | Public |
| `getPublicApiV1EventsTags` | `GET` | `/public/api/v1/events/{id}/tags` | Get Tags for Event | Public |
| `getPublicApiV1Markets` | `GET` | `/public/api/v1/markets/` | List All Markets | Public |
| `getPublicApiV1Markets` | `GET` | `/public/api/v1/markets/{id}` | Get Market by ID | Public |
| `getPublicApiV1MarketsPolymarket` | `GET` | `/public/api/v1/markets/polymarket/{polymarketId}` | Get Market by Polymarket ID | Public |
| `getPublicApiV1MarketsBsc` | `GET` | `/public/api/v1/markets/bsc/{bscQuestionId}` | Get Market by BSC Question ID | Public |
| `getPublicApiV1PublicSearch` | `GET` | `/public/api/v1/public-search/` | Search Events and Markets | Public |
| `getPublicApiV1Tags` | `GET` | `/public/api/v1/tags/` | List All Tags | Public |
| `postPublicApiV1Order` | `POST` | `/public/api/v1/order/{chainId}` | Place Order | Required |
| `deletePublicApiV1Order` | `DELETE` | `/public/api/v1/order/{chainId}/{orderId}` | Cancel Order | Required |
| `getPublicApiV1Orders` | `GET` | `/public/api/v1/orders/{chainId}/{orderId}` | Get Order | Required |
| `getPublicApiV1OrdersOpen` | `GET` | `/public/api/v1/orders/{chainId}/open` | Get Open Orders | Required |
| `getPublicApiV1Price` | `GET` | `/public/api/v1/price` | Get Price | Public |
| `postPublicApiV1Prices` | `POST` | `/public/api/v1/prices` | Get Prices (Batch) | Public |
| `getPublicApiV1Midpoint` | `GET` | `/public/api/v1/midpoint` | Get Midpoint | Public |
| `getPublicApiV1Book` | `GET` | `/public/api/v1/book` | Get Order Book | Public |
| `getPublicApiV1PricesHistory` | `GET` | `/public/api/v1/prices-history` | Get Price History | Public |
| `getPublicApiV1Trade` | `GET` | `/public/api/v1/trade/{chainId}` | Get Trades (Authenticated) | Required |
| `getPublicApiV1Trades` | `GET` | `/public/api/v1/trades` | Get Public Trades | Public |
| `getPublicApiV1Activity` | `GET` | `/public/api/v1/activity` | User Activity | Public |
| `getPublicApiV1PositionCurrent` | `GET` | `/public/api/v1/position/current` | Current Position | Public |
| `getPublicApiV1Pnl` | `GET` | `/public/api/v1/pnl` | Profit and Loss | Public |

#### Endpoint Details

##### `getPublicApiV1AuthNonce`

**GET** `/public/api/v1/auth/nonce`

Generate Nonce


---
##### `postPublicApiV1AuthLogin`

**POST** `/public/api/v1/auth/login`

Login


---
##### `postPublicApiV1AuthLogout`

**POST** `/public/api/v1/auth/logout`

Logout


---
##### `postPublicApiV1AuthApiKey`

**POST** `/public/api/v1/auth/api-key/{chainId}`

Generate API Key *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**

---
##### `getPublicApiV1AuthApiKey`

**GET** `/public/api/v1/auth/api-key/{chainId}`

Get API Key *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**

---
##### `deletePublicApiV1AuthApiKey`

**DELETE** `/public/api/v1/auth/api-key/{chainId}`

Delete API Key *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**

---
##### `postPublicApiV1AuthVerifyL1`

**POST** `/public/api/v1/auth/verify/l1`

Verify L1 Headers *(Auth required)*


---
##### `postPublicApiV1AuthVerifyL2`

**POST** `/public/api/v1/auth/verify/l2`

Verify L2 Headers *(Auth required)*


---
##### `getPublicApiV1Events`

**GET** `/public/api/v1/events/`

List All Events

**Parameters:**
- `page` (query, integer)
- `limit` (query, integer)
- `status` (query, string) — enum: `active,closed,all`
- `tag_id` (query, string)
- `sort` (query, string)

---
##### `getPublicApiV1Events`

**GET** `/public/api/v1/events/{id}`

Get Event by ID

**Parameters:**
- `id` (path, integer) **required**

---
##### `getPublicApiV1EventsSlug`

**GET** `/public/api/v1/events/slug/{slug}`

Get Event by Slug

**Parameters:**
- `slug` (path, string) **required**

---
##### `getPublicApiV1EventsTags`

**GET** `/public/api/v1/events/{id}/tags`

Get Tags for Event

**Parameters:**
- `id` (path, integer) **required**

---
##### `getPublicApiV1Markets`

**GET** `/public/api/v1/markets/`

List All Markets

**Parameters:**
- `page` (query, integer)
- `active` (query, boolean)
- `event_id` (query, integer)

---
##### `getPublicApiV1Markets`

**GET** `/public/api/v1/markets/{id}`

Get Market by ID

**Parameters:**
- `id` (path, integer) **required**

---
##### `getPublicApiV1MarketsPolymarket`

**GET** `/public/api/v1/markets/polymarket/{polymarketId}`

Get Market by Polymarket ID

**Parameters:**
- `polymarketId` (path, string) **required**

---
##### `getPublicApiV1MarketsBsc`

**GET** `/public/api/v1/markets/bsc/{bscQuestionId}`

Get Market by BSC Question ID

**Parameters:**
- `bscQuestionId` (path, string) **required**

---
##### `getPublicApiV1PublicSearch`

**GET** `/public/api/v1/public-search/`

Search Events and Markets

**Parameters:**
- `q` (query, string) **required**
- `page` (query, integer)
- `events_tag` (query, string)
- `optimized` (query, boolean)

---
##### `getPublicApiV1Tags`

**GET** `/public/api/v1/tags/`

List All Tags


---
##### `postPublicApiV1Order`

**POST** `/public/api/v1/order/{chainId}`

Place Order *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**

---
##### `deletePublicApiV1Order`

**DELETE** `/public/api/v1/order/{chainId}/{orderId}`

Cancel Order *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**
- `orderId` (path, string) **required**
- `tokenId` (query, string) **required**

---
##### `getPublicApiV1Orders`

**GET** `/public/api/v1/orders/{chainId}/{orderId}`

Get Order *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**
- `orderId` (path, string) **required**
- `tokenId` (query, string) **required**

---
##### `getPublicApiV1OrdersOpen`

**GET** `/public/api/v1/orders/{chainId}/open`

Get Open Orders *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**
- `limit` (query, integer)
- `page` (query, integer)

---
##### `getPublicApiV1Price`

**GET** `/public/api/v1/price`

Get Price

**Parameters:**
- `token_id` (query, string) **required**
- `side` (query, string) **required** — enum: `BUY,SELL`

---
##### `postPublicApiV1Prices`

**POST** `/public/api/v1/prices`

Get Prices (Batch)


---
##### `getPublicApiV1Midpoint`

**GET** `/public/api/v1/midpoint`

Get Midpoint

**Parameters:**
- `token_id` (query, string) **required**

---
##### `getPublicApiV1Book`

**GET** `/public/api/v1/book`

Get Order Book

**Parameters:**
- `token_id` (query, string) **required**

---
##### `getPublicApiV1PricesHistory`

**GET** `/public/api/v1/prices-history`

Get Price History

**Parameters:**
- `market` (query, string) **required** — Asset ID
- `interval` (query, string) — enum: `max,1m,1h,6h,1d,1w`
- `startTs` (query, integer)
- `endTs` (query, integer)

---
##### `getPublicApiV1Trade`

**GET** `/public/api/v1/trade/{chainId}`

Get Trades (Authenticated) *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**
- `tokenId` (query, string) **required**
- `limit` (query, integer)
- `next_cursor` (query, string)

---
##### `getPublicApiV1Trades`

**GET** `/public/api/v1/trades`

Get Public Trades

**Parameters:**
- `user` (query, string)
- `limit` (query, integer)
- `side` (query, string)

---
##### `getPublicApiV1Activity`

**GET** `/public/api/v1/activity`

User Activity

**Parameters:**
- `user` (query, string) **required**
- `limit` (query, integer)

---
##### `getPublicApiV1PositionCurrent`

**GET** `/public/api/v1/position/current`

Current Position

**Parameters:**
- `user` (query, string) **required**
- `eventId` (query, integer)

---
##### `getPublicApiV1Pnl`

**GET** `/public/api/v1/pnl`

Profit and Loss

**Parameters:**
- `user_address` (query, string) **required**

---
### Myriad

| `callApi()` name | Method | Path | Summary | Auth |
|-----------------|--------|------|---------|------|
| `getQuestions` | `GET` | `/questions` | List Questions | Required |
| `getQuestions` | `GET` | `/questions/{id}` | Get Question Details | Required |
| `getMarkets` | `GET` | `/markets` | List Markets | Required |
| `getMarkets` | `GET` | `/markets/{id}` | Get Market Details | Required |
| `getMarketsEvents` | `GET` | `/markets/{id}/events` | Get Market Events | Required |
| `getMarketsReferrals` | `GET` | `/markets/{id}/referrals` | Get Market Referrals | Required |
| `getMarketsHolders` | `GET` | `/markets/{id}/holders` | Get Market Holders | Required |
| `postMarketsQuote` | `POST` | `/markets/quote` | Get Trade Quote | Required |
| `postMarketsQuoteWithFee` | `POST` | `/markets/quote_with_fee` | Get Trade Quote with Frontend Fee | Required |
| `postMarketsClaim` | `POST` | `/markets/claim` | Get Claim Quote | Required |
| `getUsersEvents` | `GET` | `/users/{address}/events` | Get User Events | Required |
| `getUsersReferrals` | `GET` | `/users/{address}/referrals` | Get User Referrals | Required |
| `getUsersPortfolio` | `GET` | `/users/{address}/portfolio` | Get User Portfolio | Required |
| `getUsersMarkets` | `GET` | `/users/{address}/markets` | Get User Markets Portfolio | Required |

#### Endpoint Details

##### `getQuestions`

**GET** `/questions`

List Questions *(Auth required)*

**Parameters:**
- `page` (query, integer)
- `limit` (query, integer)
- `keyword` (query, string) — Search in question title
- `min_markets` (query, integer) — Minimum number of linked markets
- `max_markets` (query, integer) — Maximum number of linked markets

---
##### `getQuestions`

**GET** `/questions/{id}`

Get Question Details *(Auth required)*

**Parameters:**
- `id` (path, integer) **required**

---
##### `getMarkets`

**GET** `/markets`

List Markets *(Auth required)*

**Parameters:**
- `page` (query, integer)
- `limit` (query, integer)
- `sort` (query, string) — enum: `volume,volume_24h,liquidity,expires_at,published_at,featured`
- `order` (query, string) — enum: `asc,desc`
- `network_id` (query, string) — Comma-separated list of network ids
- `state` (query, string) — enum: `open,closed,resolved`
- `token_address` (query, string)
- `topics` (query, string) — Comma-separated list of topics
- `keyword` (query, string) — Full-text search across title, description, and outcome titles
- `ids` (query, string) — Comma-separated list of on-chain market ids
- `in_play` (query, boolean)
- `moneyline` (query, boolean)
- `min_duration` (query, integer) — Minimum market duration in seconds
- `max_duration` (query, integer) — Maximum market duration in seconds

---
##### `getMarkets`

**GET** `/markets/{id}`

Get Market Details *(Auth required)*

**Parameters:**
- `id` (path, string) **required** — Market slug OR Market ID
- `network_id` (query, integer) — Required if 'id' in path is a numeric Market ID

---
##### `getMarketsEvents`

**GET** `/markets/{id}/events`

Get Market Events *(Auth required)*

**Parameters:**
- `id` (path, string) **required** — Market slug OR Market ID
- `network_id` (query, integer) — Required if 'id' in path is a numeric Market ID
- `page` (query, integer)
- `limit` (query, integer)
- `since` (query, integer) — Unix seconds (inclusive)
- `until` (query, integer) — Unix seconds (inclusive)

---
##### `getMarketsReferrals`

**GET** `/markets/{id}/referrals`

Get Market Referrals *(Auth required)*

**Parameters:**
- `id` (path, string) **required** — Market slug OR Market ID
- `network_id` (query, integer) — Required if 'id' in path is a numeric Market ID
- `page` (query, integer)
- `limit` (query, integer)
- `since` (query, integer)
- `until` (query, integer)
- `code` (query, string)

---
##### `getMarketsHolders`

**GET** `/markets/{id}/holders`

Get Market Holders *(Auth required)*

**Parameters:**
- `id` (path, string) **required** — Market slug OR Market ID
- `network_id` (query, integer) — Required if 'id' in path is a numeric Market ID
- `page` (query, integer)
- `limit` (query, integer)

---
##### `postMarketsQuote`

**POST** `/markets/quote`

Get Trade Quote *(Auth required)*


---
##### `postMarketsQuoteWithFee`

**POST** `/markets/quote_with_fee`

Get Trade Quote with Frontend Fee *(Auth required)*


---
##### `postMarketsClaim`

**POST** `/markets/claim`

Get Claim Quote *(Auth required)*


---
##### `getUsersEvents`

**GET** `/users/{address}/events`

Get User Events *(Auth required)*

**Parameters:**
- `address` (path, string) **required**
- `page` (query, integer)
- `limit` (query, integer)
- `market_id` (query, string)
- `market_slug` (query, string)
- `network_id` (query, integer)
- `since` (query, integer)
- `until` (query, integer)

---
##### `getUsersReferrals`

**GET** `/users/{address}/referrals`

Get User Referrals *(Auth required)*

**Parameters:**
- `address` (path, string) **required**
- `page` (query, integer)
- `limit` (query, integer)
- `market_id` (query, string)
- `market_slug` (query, string)
- `network_id` (query, integer)
- `since` (query, integer)
- `until` (query, integer)
- `code` (query, string)

---
##### `getUsersPortfolio`

**GET** `/users/{address}/portfolio`

Get User Portfolio *(Auth required)*

**Parameters:**
- `address` (path, string) **required**
- `page` (query, integer)
- `limit` (query, integer)
- `min_shares` (query, number) — Default 0.1
- `market_slug` (query, string)
- `market_id` (query, string)
- `network_id` (query, integer)
- `token_address` (query, string)

---
##### `getUsersMarkets`

**GET** `/users/{address}/markets`

Get User Markets Portfolio *(Auth required)*

**Parameters:**
- `address` (path, string) **required**
- `page` (query, integer)
- `limit` (query, integer)
- `min_shares` (query, number)
- `network_id` (query, integer)
- `state` (query, string)
- `token_address` (query, string)
- `topics` (query, string)
- `keyword` (query, string)
- `market_ids` (query, string) — Comma-separated list of {networkId}:{marketId} pairs

---
