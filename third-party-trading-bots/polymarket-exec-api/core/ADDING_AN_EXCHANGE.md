# Adding a New Exchange

This guide walks through every file and registration point required to add a new prediction market exchange to pmxt.

## Overview

An exchange implementation lives in `core/src/exchanges/<name>/` and consists of these files:

| File | Purpose |
|------|---------|
| `api.ts` | Auto-generated from the exchange's OpenAPI spec -- the source of all implicit API methods |
| `utils.ts` | API URLs, status mapping, `mapMarketToUnified()` helper |
| `errors.ts` | Exchange-specific error patterns extending `ErrorMapper` |
| `auth.ts` | Credential validation, header/signer generation |
| `fetchMarkets.ts` | Fetch and normalize markets to `UnifiedMarket[]` |
| `fetchEvents.ts` | Fetch and normalize events to `UnifiedEvent[]` |
| `fetchOHLCV.ts` | Historical candle data mapped to `PriceCandle[]` |
| `fetchOrderBook.ts` | *(optional)* Order book -- create if the logic is complex enough to warrant it |
| `fetchTrades.ts` | *(optional)* Trade history -- create if the logic is complex enough to warrant it |
| `websocket.ts` | Real-time streaming (`watchOrderBook`, `watchTrades`, `close`) |
| `index.ts` | Main class: constructor calls `defineImplicitApi`, methods use `callApi` |

See the compliance matrix in `core/COMPLIANCE.md` for which methods are required vs. optional.

## Reference Implementations

- **Kalshi** (`core/src/exchanges/kalshi/`) -- cleanest example of the current pattern: single `api.ts`, methods inline in `index.ts` or delegated via `callApi.bind(this)`, good starting point
- **Polymarket** (`core/src/exchanges/polymarket/`) -- most complete, three separate api-*.ts specs, CLOB with L1/L2 auth

Read through Kalshi first to understand the pattern, then reference Polymarket for more advanced cases.

## Step-by-Step Walkthrough

### 1. Create the exchange directory

```
core/src/exchanges/<name>/
core/specs/<name>/
```

### 2. `api.ts` -- Implicit API from the exchange's OpenAPI spec

The exchange's public OpenAPI spec is the source of truth for making API calls. Place the raw YAML spec in `core/specs/<name>/`, then convert it to a TypeScript export in `api.ts`:

```typescript
// core/src/exchanges/example/api.ts
// Generated from core/specs/example/Example.yaml

export const exampleApiSpec = {
    "openapi": "3.0.0",
    "info": { "title": "Example API", "version": "1.0.0" },
    "servers": [{ "url": "https://api.example.com/v1" }],
    "paths": {
        "/markets": {
            "get": {
                "operationId": "GetMarkets",
                "security": [],
                // ...
            }
        },
        "/portfolio/balance": {
            "get": {
                "operationId": "GetBalance",
                "security": [{ "ApiKeyAuth": [] }],
                // ...
            }
        }
    }
};
```

The `operationId` for each endpoint becomes the name used with `callApi()`. If the exchange doesn't provide an OpenAPI spec, write one manually that covers the endpoints you need.

If an exchange needs more than one API (e.g. a trading API and a data API), create multiple spec files (`api-trading.ts`, `api-data.ts`) and call `defineImplicitApi()` once per spec in the constructor.

### 3. `utils.ts` -- API constants and mapping helpers

Define:
- Base API URL constants (REST, WebSocket)
- Status mapping functions (exchange-native statuses to unified statuses)
- `mapMarketToUnified()` -- converts a raw API market object into a `UnifiedMarket`

```typescript
export const BASE_URL = 'https://api.example.com/v1';
export const WS_URL = 'wss://ws.example.com';

export function mapMarketToUnified(raw: any): UnifiedMarket {
    return {
        marketId: raw.id,
        title: raw.name,
        description: raw.description,
        outcomes: raw.outcomes.map(mapOutcome),
        resolutionDate: new Date(raw.end_date),
        volume24h: raw.volume_24h,
        liquidity: raw.liquidity,
        url: `https://example.com/markets/${raw.slug}`,
    };
}
```

See `kalshi/utils.ts` or `polymarket/utils.ts` for complete examples.

### 4. `errors.ts` -- Exchange-specific error mapping

Extend `ErrorMapper` from `core/src/utils/error-mapper.ts` with patterns specific to this exchange's API error responses.

```typescript
import { ErrorMapper } from '../../utils/error-mapper';

export const exampleErrorMapper = new ErrorMapper('Example');
```

If the exchange has unique error formats, override `mapBadRequestError` or `mapNotFoundError` in a subclass. See `polymarket/errors.ts` for an example with custom patterns.

### 5. `auth.ts` -- Authentication

Handle credential validation and request signing. The structure depends on the exchange's auth mechanism:

- **API key + signature** (like Kalshi): Validate credentials on construction, provide a `getHeaders(method, path)` method
- **Wallet-based** (like Polymarket): Handle key derivation, L1/L2 auth flows

```typescript
export class ExampleAuth {
    private credentials: ExchangeCredentials;

    constructor(credentials: ExchangeCredentials) {
        this.credentials = credentials;
        this.validateCredentials();
    }

    private validateCredentials() {
        if (!this.credentials.apiKey) {
            throw new Error('Example requires an apiKey for authentication');
        }
    }

    getHeaders(method: string, path: string): Record<string, string> {
        // Generate auth headers for the request
        return { 'Authorization': `Bearer ${this.credentials.apiKey}` };
    }
}
```

### 6. Fetch modules -- `fetchMarkets.ts`, `fetchEvents.ts`, etc.

Each fetch module is a plain function that accepts `callApi` as a parameter and returns unified types. This keeps the exchange logic testable without needing a full class instance.

```typescript
// fetchMarkets.ts
type CallApi = (operationId: string, params?: Record<string, any>) => Promise<any>;

export async function fetchMarkets(
    params: MarketFilterParams | undefined,
    callApi: CallApi
): Promise<UnifiedMarket[]> {
    const data = await callApi('GetMarkets', {
        limit: params?.limit ?? 100,
        status: params?.status === 'all' ? undefined : 'active',
    });

    return (data.markets || []).map(mapMarketToUnified);
}
```

For modules that need direct HTTP access (e.g. a custom pagination scheme), accept `http: AxiosInstance` instead of or in addition to `callApi`. See `polymarket/fetchMarkets.ts` for an example.

The same pattern applies to `fetchEvents.ts` and `fetchOHLCV.ts`. For simpler methods like `fetchOrderBook` and `fetchTrades`, inline them directly in `index.ts` using `callApi` rather than creating separate files -- see `kalshi/index.ts` for examples. Only extract them into their own files if the transformation logic is substantial.

### 7. `websocket.ts` -- Real-time data

Implement WebSocket streaming following the CCXT Pro async pattern:

```typescript
export class ExampleWebSocket {
    async watchOrderBook(id: string): Promise<OrderBook> {
        // Returns a promise that resolves on the next orderbook update
    }

    async watchTrades(id: string): Promise<Trade[]> {
        // Returns a promise that resolves on the next batch of trades
    }

    async close(): Promise<void> {
        // Clean up connection and reject pending promises
    }
}
```

Key implementation details:
- Maintain promise queues per subscription (resolvers are stored, then resolved when data arrives)
- Cache the latest order book state and apply deltas
- Handle reconnection automatically
- Track subscriptions to resubscribe on reconnect

See `kalshi/websocket.ts` for a complete reference implementation.

### 8. `index.ts` -- Main exchange class

Wire everything together by extending `PredictionMarketExchange`. The constructor must call `defineImplicitApi()` with the parsed spec, which generates callable methods for every `operationId`. All API calls then go through `callApi()`.

```typescript
import { PredictionMarketExchange, MarketFilterParams, ExchangeCredentials } from '../../BaseExchange';
import { parseOpenApiSpec } from '../../utils/openapi';
import { exampleApiSpec } from './api';
import { ExampleAuth } from './auth';
import { exampleErrorMapper } from './errors';
import { fetchMarkets } from './fetchMarkets';

export class ExampleExchange extends PredictionMarketExchange {
    override readonly has = {
        fetchMarkets: true as const,
        fetchEvents: true as const,
        // ... mark what you implement
    };

    private auth?: ExampleAuth;

    constructor(credentials?: ExchangeCredentials) {
        super(credentials);

        if (credentials?.apiKey) {
            this.auth = new ExampleAuth(credentials);
        }

        // Register the implicit API -- generates a method for every operationId in the spec
        const descriptor = parseOpenApiSpec(exampleApiSpec);
        this.defineImplicitApi(descriptor);
    }

    get name(): string {
        return 'Example';
    }

    // Override to map exchange API errors to unified error types
    protected override mapImplicitApiError(error: any): any {
        throw exampleErrorMapper.mapError(error);
    }

    // Override sign() to provide auth headers for private endpoints
    protected override sign(method: string, path: string, _params: Record<string, any>): Record<string, string> {
        return this.ensureAuth().getHeaders(method, path);
    }

    // Market data -- delegate to fetch modules, passing callApi
    protected async fetchMarketsImpl(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        return fetchMarkets(params, this.callApi.bind(this));
    }

    // Simple methods can use callApi directly in index.ts
    async fetchOrderBook(id: string): Promise<OrderBook> {
        const data = await this.callApi('GetOrderBook', { market_id: id });
        return {
            bids: data.bids.map((b: any) => ({ price: b.price, size: b.size })),
            asks: data.asks.map((a: any) => ({ price: a.price, size: a.size })),
            timestamp: Date.now(),
        };
    }

    // Authenticated trading methods
    async createOrder(params: CreateOrderParams): Promise<Order> {
        this.ensureAuth();
        const data = await this.callApi('CreateOrder', {
            market_id: params.marketId,
            side: params.side,
            amount: params.amount,
            price: params.price,
        });
        return mapOrder(data.order);
    }

    // WebSocket -- lazy-init
    async watchOrderBook(id: string): Promise<OrderBook> {
        if (!this.ws) this.ws = new ExampleWebSocket();
        return this.ws.watchOrderBook(id);
    }
}
```

The base class uses a delegation pattern: public methods like `fetchMarkets()` call protected `fetchMarketsImpl()`. Override the `*Impl` methods for market data. Trading and websocket methods are overridden directly.

## Registration Checklist

After implementing the exchange, register it in these 4 files:

### 1. `core/src/index.ts` -- Export the class

```typescript
export * from './exchanges/<name>';

import { ExampleExchange } from './exchanges/<name>';

const pmxt = {
    Polymarket: PolymarketExchange,
    Limitless: LimitlessExchange,
    Kalshi: KalshiExchange,
    Example: ExampleExchange,        // <-- add
};

export const Example = ExampleExchange;
```

### 2. `core/src/server/app.ts` -- Register with the server

```typescript
const defaultExchanges: Record<string, any> = {
    polymarket: null,
    limitless: null,
    kalshi: null,
    example: null,        // <-- add
};

// Add case to createExchange() switch
case 'example':
    return new ExampleExchange({
        apiKey: credentials?.apiKey || process.env.EXAMPLE_API_KEY,
        privateKey: credentials?.privateKey || process.env.EXAMPLE_PRIVATE_KEY,
    });
```

### 3. `core/src/server/openapi.yaml` -- Add to API schema

Add the exchange name to the `ExchangeParam` enum:

```yaml
components:
  parameters:
    ExchangeParam:
      in: path
      name: exchange
      schema:
        type: string
        enum: [polymarket, kalshi, limitless, example]  # <-- add
      required: true
```

After modifying the OpenAPI spec, regenerate SDK clients so they include the new exchange.

### 4. `core/COMPLIANCE.md` -- Add to compliance matrix

Add a column for the new exchange in the feature support table, marking each function as supported, unsupported, or partial.

## Testing

Run the test suite to verify your implementation:

```bash
# Unit tests
npm test

# Full verification (if available)
scripts/verify-all.sh
```

Write compliance tests that exercise every method. Tests should **fail** (not warn) if expected data is missing -- this catches API breakages early. See existing tests in `core/test/` for the expected patterns.

For authenticated tests, add environment variables to a `.env` file in the project root:

```
EXAMPLE_API_KEY=...
EXAMPLE_PRIVATE_KEY=...
```
