# Architecture

This document explains the design decisions behind pmxt and where different types of changes should go.

## The Sidecar Pattern

pmxt uses a **sidecar architecture**: a Node.js server sits between the SDKs and exchange APIs.

```
Python SDK   ──┐
               ├──  HTTP  ──>  Server (Node.js)  ──>  Exchange APIs
TypeScript SDK ┘
```

**Why?** Exchange integrations are implemented once in TypeScript (`core/`). SDKs are thin HTTP wrappers that spawn the server as a background process -- they don't contain any exchange logic themselves. Adding a new exchange automatically makes it available in every SDK.

## The OpenAPI Schema

`core/src/server/openapi.yaml` is the contract that powers everything:

- Defines every endpoint the sidecar exposes
- `openapi-generator-cli` uses it to auto-generate SDK clients into `sdks/*/generated/`
- Adding a new exchange = adding its name to the `ExchangeParam` enum
- Adding a new method = defining the endpoint and schemas in openapi.yaml, then regenerating SDKs

Never edit files under `sdks/*/generated/` by hand -- they are overwritten on regeneration.

## The Implicit API Pattern

Each exchange uses a **two-level API system**:

1. **Unified API** -- the public interface defined in `BaseExchange` (`fetchMarkets`, `createOrder`, etc.)
2. **Implicit API** -- auto-generated methods derived from the exchange's own OpenAPI spec

### How it works

Each exchange directory contains one or more `api.ts` files (generated from YAML specs stored in `core/specs/<exchange>/`). The constructor parses these and registers them with `defineImplicitApi()`:

```typescript
constructor(credentials?: ExchangeCredentials) {
    super(credentials);
    const descriptor = parseOpenApiSpec(kalshiApiSpec);
    this.defineImplicitApi(descriptor);
}
```

This auto-generates a callable method on the instance for every `operationId` in the spec. Unified methods then invoke them via `callApi()`:

```typescript
async fetchOrderBook(id: string): Promise<OrderBook> {
    const data = await this.callApi('GetMarketOrderbook', { ticker: id });
    // ... transform and return
}
```

`callApi` resolves the operationId to the generated method, handles path/query/body parameter routing based on HTTP method, and invokes the exchange's `sign()` method for private endpoints.

Exchange-specific fetch modules (e.g. `fetchMarkets.ts`) receive `callApi` as a parameter rather than accessing it directly:

```typescript
protected async fetchMarketsImpl(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
    return fetchMarkets(params, this.callApi.bind(this));
}
```

Exchanges that need multiple API specs (like Polymarket) call `defineImplicitApi()` once per spec. Methods from all specs are merged onto the same instance.

## Request Lifecycle

```
SDK call (e.g. exchange.fetchMarkets())
  -> HTTP POST /api/{exchange}/{method}
    -> Auth middleware (validates x-pmxt-access-token)
      -> Extract exchange name, method name, args from request
        -> Get exchange instance:
           - With credentials in body -> new per-request instance
           - Without credentials -> cached singleton from defaultExchanges
          -> Validate method exists on exchange class
            -> exchange[method](...args)
              -> callApi('OperationId', params)
                -> Generated implicit method -> HTTP request to exchange API
              -> Response: { success: true, data: result }
```

The server (`core/src/server/app.ts`) routes dynamically -- there is no per-method routing. The exchange class method name in the URL maps directly to a method call on the exchange instance.

## Directory Map

```
core/
  specs/                     Exchange OpenAPI YAML specs (source of truth for api.ts)
    kalshi/
    polymarket/
    limitless/
    ...
  src/
    exchanges/               Exchange implementations (one directory per exchange)
      kalshi/
        api.ts               Generated from core/specs/kalshi/ -- do not edit by hand
        auth.ts              Credential validation and request signing
        errors.ts            Exchange-specific error mapping
        fetchMarkets.ts      Market data -- accepts callApi as a parameter
        fetchEvents.ts       Event data -- accepts callApi as a parameter
        fetchOHLCV.ts        OHLCV candles -- accepts callApi as a parameter
        utils.ts             Mapping helpers (mapMarketToUnified, etc.)
        websocket.ts         Real-time streaming
        index.ts             Main class: constructor calls defineImplicitApi; methods use callApi
      polymarket/
        api-clob.ts          Generated: CLOB trading API spec
        api-data.ts          Generated: market data API spec
        api-gamma.ts         Generated: events/search API spec
        ...                  Same structure as kalshi otherwise
    server/
      app.ts                 Express server -- routing, auth middleware, error handling
      openapi.yaml           OpenAPI spec -- the API contract for the sidecar
    utils/
      error-mapper.ts        Base error mapping (HTTP status -> typed errors)
      openapi.ts             parseOpenApiSpec() -- converts api.ts specs into ApiDescriptors
    BaseExchange.ts          Abstract base class: defineImplicitApi, callApi, unified API
    types.ts                 Unified data types (UnifiedMarket, Order, Trade, etc.)
    errors.ts                Error class hierarchy (BaseError, AuthenticationError, etc.)
    index.ts                 Main exports -- exchange classes + default export object

sdks/
  python/
    generated/               Auto-generated from openapi.yaml (never edit)
    pmxt/                    Hand-written SDK: client, models, server manager
  typescript/
    generated/               Auto-generated from openapi.yaml (never edit)
    pmxt/                    Hand-written SDK wrapper

scripts/                     Build, test, and utility scripts
```

## "I want to..." Decision Tree

**Add an exchange**
See [`core/ADDING_AN_EXCHANGE.md`](core/ADDING_AN_EXCHANGE.md). Requires creating an `api.ts` from the exchange's OpenAPI spec, implementing the exchange directory, then registering in 4 files.

**Add a new API method**
1. Implement the method on `PredictionMarketExchange` in `core/src/BaseExchange.ts`
2. Add the implementation to each exchange using `callApi('OperationId', params)`
3. Define the endpoint and request/response schemas in `core/src/server/openapi.yaml`
4. Regenerate SDK clients

**Fix a bug in market data**
Edit the relevant fetch module: `core/src/exchanges/<name>/fetchMarkets.ts`, `fetchOrderBook.ts`, etc.

**Fix a bug in trading**
Edit the trading methods in `core/src/exchanges/<name>/index.ts`.

**Fix a WebSocket bug**
Edit `core/src/exchanges/<name>/websocket.ts`.

**Update an exchange's API calls**
Edit the YAML spec in `core/specs/<name>/`, regenerate `api.ts` with `npm run fetch:openapi`, then update any `callApi()` operationIds that changed.

**Change unified types**
Edit `core/src/types.ts` and update the corresponding schemas in `core/src/server/openapi.yaml`. Then update each exchange implementation to conform to the new types.

**Change error handling**
Base error mapping lives in `core/src/utils/error-mapper.ts`. Exchange-specific overrides are in `core/src/exchanges/<name>/errors.ts`.

**Update an SDK**
Hand-written SDK code lives in `sdks/*/pmxt/`. If the change involves the API contract, update `openapi.yaml` and regenerate instead.
