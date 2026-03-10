# Changelog

All notable changes to this project will be documented in this file.

## [2.17.7] - 2026-02-25

### Fixed

- **Python SDK Missing Exchange Classes**: `pmxt.Probable`, `pmxt.Baozi`, and `pmxt.Myriad` raised `AttributeError` on import because the Python SDK's exchange subclasses were maintained manually and had drifted from the TypeScript core. All three classes are now available.

### Infrastructure

- **Auto-generated Python SDK exchange classes**: `sdks/python/pmxt/_exchanges.py` is now generated from `core/src/server/app.ts` (the single source of truth for registered exchanges) via `core/scripts/generate-python-exchanges.js`. The generator also keeps `__init__.py` imports and `__all__` in sync. A CI guard (`python-exchanges-check.yml`) fails any PR where the generated file diverges from the committed one.
- **Auto-generated `COMPLIANCE.md`**: The feature support matrix is now generated from exchange implementations via `core/scripts/generate-compliance.js`, replacing the previously manual document. A CI guard (`compliance-check.yml`) keeps it in sync with `core/src/exchanges/*/index.ts`.
- **TypeScript SDK client methods CI guard**: Added `typescript-client-check.yml` to fail PRs where `BaseExchange.ts` changes without regenerating the corresponding methods in the TypeScript SDK `client.ts`.
- All three generators are wired into `generate:sdk:all` and run automatically on every publish.

## [2.17.6] - 2026-02-24

### Fixed

- **Duplicate `eventId` in `UnifiedMarket` causes build failure**: The v2.17.5 fix added `eventId?: string` to `core/src/types.ts` but the field already existed at line 34, resulting in `TS2300: Duplicate identifier 'eventId'` and a broken build. The duplicate declaration is removed.

## [2.17.5] - 2026-02-24

### Fixed

- **`UnifiedMarket.event` circular type corrected to `eventId`**: The `event?: UnifiedEvent` field on `UnifiedMarket` (in both `core/src/types.ts` and the TypeScript SDK `models.ts`) was a design error — storing a full back-reference to the parent event creates a circular structure that breaks `JSON.stringify`. The field is now typed as `eventId?: string`, consistent with how every exchange util already populated it. The TypeScript SDK's `convertMarket` function now also passes `eventId` through from the server response.

## [2.17.4] - 2026-02-24

### Fixed

- **Polymarket Cloudflare WAF Bypass**: The User-Agent header added in v2.17.2 was insufficient to bypass Polymarket's Cloudflare bot detection. Enhanced the Polymarket client with browser-mimicking headers (`Accept`, `Accept-Language`, `Origin: https://polymarket.com`, `Referer`, and `sec-fetch-*` directives). These headers make requests appear as same-site CORS calls from the Polymarket frontend, allowing the API to pass Cloudflare's bot scoring model. `fetchEvents()` now works reliably on all platforms.

## [2.17.3] - 2026-02-24

### Fixed

- **Fatal Circular JSON Crash (`fetchEvents`)**: Fixed a `TypeError: Converting circular structure to JSON` that fatally crashed the sidecar server on every `fetchEvents` call across all exchanges. The v2.17.2 patch injected `market.event = event` inside the core exchange functions, creating an `event → markets[0] → event` reference cycle. Since Express serializes sidecar responses via `JSON.stringify`, this caused an unrecoverable crash propagated to all SDK clients. The `market.event` back-references are now hydrated exclusively client-side inside `convertEvent` in the TypeScript SDK, keeping all sidecar REST payloads strictly acyclic.

## [2.17.2] - 2026-02-24

### Fixed

- **Bi-directional Navigation (`market.event`)**: Added `market.event` back-reference hydration to the TypeScript SDK's `convertEvent` function, enabling navigation from any market to its parent event. Note: this release accidentally also injected the circular reference server-side, causing a fatal JSON serialization crash fixed in v2.17.3.
- **Global User-Agent Header**: Added a default generic `User-Agent` header (`pmxt (https://github.com/pmxt-dev/pmxt)`) to the `BaseExchange` axios configuration. This ensures consistent identification across all exchanges and resolves the **Polymarket Discovery 401 Error** that occurred when calling `fetchEvents()` without parameters, effectively bypassing WAF/CDN restrictions.

## [2.17.1] - 2026-02-24

### Fixed

- **Sidecar Bundle Drift**: The features shipped in 2.17.0 (parameterless `fetchEvents()`, Kalshi client-side sorting) were correctly implemented in TypeScript source but **never reached users** because the publish pipeline was missing the `bundle:server` step for the npm job. The distributed `pmxt-core` package contained a stale pre-compiled sidecar (`bundled.js`) from a previous release that still enforced the old guard `fetchEvents() requires a query, eventId, or slug parameter`. This patch rebuilds and ships the correct bundle.
- **CI/CD: Publish Workflow**: Added `npm run bundle:server` to the `publish-npm` job in `publish.yml`, immediately after the `Build Core` step. Without this, source-level changes to the sidecar server are silently ignored in all npm-distributed packages.
- **CI/CD: Test Workflow**: Applied the same fix to `test-publish.yml` so dry-run publishes and test runs also exercise the correct sidecar, preventing this class of drift from going undetected in future PRs.

## [2.17.0] - 2026-02-24

### Improved

- **Unified Discovery: Unrestricted Event Fetching**: Removed the mandatory requirement for a query, event identification, or slug in `fetchEvents`. Users can now call `fetchEvents()` without parameters to retrieve the "front page" of an exchange (typically top events by volume).
- **Polymarket: High-Performance Discovery**: Redirects no-query `fetchEvents` calls to the specific Gamma `/events` list endpoint, providing a cleaner and faster experience than the fuzzy search path.
- **Kalshi: Client-Side Event Ranking**: Implemented robust client-side sorting for Kalshi events. Since the Kalshi API lacks server-side sorting for the event list, `fetchEvents` now aggregates volume, liquidity, and recency from nested markets to provide consistent `sort` support (`volume`, `liquidity`, `newest`).
- **Limitless: Semantic Event Mapping**: Mapped Limitless "Group Markets" to the unified `fetchEvents` interface. Discovery calls now automatically filter for group markets, aligning Limitless with event-centric discovery patterns.
- **Developer Experience**: Synchronized `fetchEvents` behavior with `fetchMarkets` across all exchanges (Baozi, Myriad, Probable, Kalshi, Polymarket, Limitless).

### Fixed

- **Unit Tests**: Updated core validation suite to reflect the relaxed requirements for event fetching.

## [2.16.1] - 2026-02-24

### Fixed

- **Documentation: Automated Generator**: Fixed a bug in `generate-openapi.js` where certain model fields (like `eventId` and `sort`) were not being correctly reflected in the generated SDK documentation.
- **SDK: Regenerated Reference Docs**: Synchronized `API_REFERENCE.md` for both Python and TypeScript to include the newly added traversal and sorting capabilities.

## [2.16.0] - 2026-02-24

### Added

- **Unified Traversal: Market-to-Event Linkage**: Added `eventId` to the `UnifiedMarket` interface across all exchanges. This allows direct navigation from a market back to its parent event container.
- **Unified Traversal: Outcome-to-Market Linkage**: Ensured `marketId` is consistently populated on all `MarketOutcome` objects.
- **Event Search: Unified Sorting**: Added `sort` parameter support to `fetchEvents` for better developer experience and consistency with `fetchMarkets`.

### Improved

- **Polymarket: Direct Event Lookup**: Enhanced `fetchEvents` for Polymarket to support direct `eventId` and `slug` lookups, removing the previous requirement for a keyword search query when the ID is already known.
- **Cross-Exchange Consistency**: Synchronized `fetchEvents` and `fetchMarkets` behavior across Polymarket, Kalshi, Limitless, Myriad, and Probable.

## [2.15.0] - 2026-02-24

### Added

- **TypeScript SDK: Automated Client Method Generation**: Introduced `sdks/typescript/scripts/generate-client-methods.js`, a script that introspects `BaseExchange.ts` via the TypeScript AST and auto-generates typed client method stubs in `client.ts`. This ensures the TypeScript SDK stays in sync with core method additions without manual updates.
- **TypeScript SDK: SDK Surface Area Tests**: Added `sdks/typescript/tests/surface.test.ts` with 175 tests (25 public methods × 7 exchange classes). These tests verify that every method defined in `BaseExchange` is correctly exposed on all exchange clients (Polymarket, Kalshi, KalshiDemo, Limitless, Myriad, Probable, Baozi). No server required — prototype checks only.

### Fixed

- **TypeScript SDK: Integration Test Reliability**: Refactored `sdks/typescript/tests/integration.test.ts` to use a shared `beforeAll` per describe block (avoiding redundant API calls per test), pass `{ limit: 5 }` to both Polymarket and Kalshi `fetchMarkets` to prevent full-catalog fetches, and set a 120s `beforeAll` timeout to handle Polymarket Gamma API response variance (which can exceed 30s under load). All 6 integration tests now pass reliably.

## [2.14.1] - 2026-02-23

### Fixed

- **Sidecar Server Build**: Resolved a critical TypeScript compilation error in `app.ts` caused by an invalid Express error handler signature. This fix ensures the unified sidecar server can be successfully bundled and published.

## [2.14.0] - 2026-02-23

### Added

- **Kalshi Demo Support**: Introduced full support for the Kalshi Demo (simulated) environment across both TypeScript and Python SDKs.
  - **TypeScript**: New `KalshiDemoExchange` class for direct access to the demo environment.
  - **Python**: Updated `Kalshi` class with a `demo=True` parameter for easy environment switching.
  - **Unified Configuration**: Centralized API and WebSocket URL management to ensure consistency between production and demo environments.
- **Dome API Migration**: Added a dedicated migration guide and landing page for users transitioning from the shut-down Dome API.
- **Kalshi Setup Documentation**: Included a comprehensive setup guide in the core documentation for Kalshi integration.

### Fixed

- **Kalshi Demo Connectivity**: Corrected internal API and WebSocket endpoints for the Kalshi Demo environment to ensure reliable connectivity.
- **Core Stability**: Resolved merge conflicts and performed general code cleanup in the sidecar server.

### Documentation

- **Project Metadata**: Updated download statistics and project badges.

## [2.13.2] - 2026-02-22

### Fixed

- **TypeScript SDK Build**: Resolved type shadowing issues in the auto-generated SDK by ensuring all request body schemas in the OpenAPI specification carry a distinct `title` property.
- **Client Implementation**: Corrected calling conventions and type references in `client.ts` for `fetchBalance`, `cancelOrder`, and `fetchOrder` to align with the latest generated types.

## [2.13.1] - 2026-02-22

### Fixed

- **TypeScript SDK Build**: Resolved critical compilation errors introduced by OpenAPI spec auto-generation (v2.13.0).
  - Added missing `title` fields to inline request schemas in `openapi.yaml` (cancelOrder, fetchOrder endpoints) so the OpenAPI generator creates proper named types.
  - Fixed incorrect type references in `client.ts` `fetchOrder` method (was using `CancelOrderRequest` instead of `FetchOrderRequest`).
  - Enhanced `fix-generated.js` post-processing script to properly handle union type discriminators and TypeScript type narrowing issues in generated code.
  - Fixed type narrowing failures in `FilterEventsRequestArgsInner` and `FilterMarketsRequestArgsInner` by adding explicit type casts in `.every()` and `.map()` calls.

## [2.13.0] - 2026-02-22

### Added

- **Unified Sidecar API Expansion**: Formally exposed `fetchMyTrades`, `fetchClosedOrders`, and `fetchAllOrders` in the sidecar server and generated SDKs, completing the functional rollout of the Order History API.
- **New Public Methods**: Introduced `loadMarkets()` and `fetchMarketsPaginated()` to the public SDKs for stateful market caching and stable pagination support.
- **OpenAPI Auto-Generation**: Implemented a reflection-based specification generator (`core/scripts/generate-openapi.js`) that automatically derives the sidecar API from the `BaseExchange` TypeScript definition.
- **CI Synchronization Check**: Added a GitHub Action workflow to ensure the OpenAPI spec and SDKs stay perfectly in sync with the core library on every contribution.

### Changed

- **SDK Feature Parity**: Regenerated both Python and TypeScript SDKs to include the latest unified methods and data models (e.g., `UserTrade`, `PaginatedMarketsResult`).

### Documentation

- **Contributor Workflow**: Updated `CONTRIBUTING.md` with instructions on using the new automated OpenAPI generation pipeline.


## [2.12.1] - 2026-02-22

### Fixed

- **Security**: Bound the sidecar server to `127.0.0.1` by default to prevent accidental exposure on all network interfaces (`0.0.0.0`).

## [2.12.0] - 2026-02-22

### Added

- **Unified Order History API**: Standardized methods across all exchanges for retrieving private trade and order history.
  - New methods: `fetchMyTrades()`, `fetchClosedOrders()`, and `fetchAllOrders()`.
  - Introduced `UserTrade` type which includes `orderId` for linking trades to specific orders.
- **Exchange Support**:
  - Implemented `fetchMyTrades` for **Polymarket**, **Limitless**, **Myriad**, and **Probable**.
  - Implemented `fetchClosedOrders` and `fetchAllOrders` for **Kalshi**, **Polymarket**, **Limitless**, **Probable**, and **Myriad**.
- **Compliance Testing**: Added comprehensive test suites for validating order and trade history implementations across all exchanges.

### Changed

- **Testing Utilities**: Added `validateUserTrade` to compliance test suite for standardized trade verification.

## [2.12.0] - 2026-02-22

### Added

- **Unified Order History API**: Standardized methods across all exchanges for retrieving private trade and order history.
  - New methods: `fetchMyTrades()`, `fetchClosedOrders()`, and `fetchAllOrders()`.
  - Introduced `UserTrade` type which includes `orderId` for linking trades to specific orders.
- **Exchange Support**:
  - Implemented `fetchMyTrades` for **Polymarket**, **Limitless**, **Myriad**, and **Probable**.
  - Implemented `fetchClosedOrders` and `fetchAllOrders` for **Kalshi**, **Polymarket**, **Limitless**, **Probable**, and **Myriad**.
- **Compliance Testing**: Added comprehensive test suites for validating order and trade history implementations across all exchanges.

### Changed

- **Testing Utilities**: Added `validateUserTrade` to compliance test suite for standardized trade verification.

## [2.11.0] - 2026-02-22

### Added

- **CCXT-Style Rate Limiting**: Implemented automatic rate limiting across all exchanges using a token bucket (leaky bucket) algorithm, preventing 429 errors and request throttling.
  - **Unified Throttling**: All REST requests (both explicit and via `callApi`) automatically respect exchange rate limits through a single axios request interceptor on `this.http`.
  - **Per-Exchange Configuration**: Each exchange sets its own rate limit (e.g., Polymarket: 200ms, Kalshi: 100ms, Myriad/Baozi/Probable: 500ms).
  - **User Control**: Developers can override rate limits per-instance (`exchange.rateLimit = 50`) or disable entirely (`exchange.enableRateLimit = false`).
  - **Leaky Bucket Implementation**: Queue-based token refill with no busy spinning, maintaining simplicity while ensuring fair request spacing.
- **Throttler Utility**: New `Throttler` class in `core/src/utils/throttler.ts` providing a standalone, exchange-agnostic token bucket implementation for queue-based async throttling.

### Changed

- **BaseExchange**: Added `rateLimit` property (default 1000ms) and `enableRateLimit` property (default true) to match CCXT conventions.

## [2.10.0] - 2026-02-19

### Added

- **Low-Level API Access (`callApi` / `call_api`)**: Exposed a new method on all exchange instances that allows direct invocation of any exchange-specific REST endpoint by its OpenAPI `operationId`. This gives advanced users full access to every underlying API endpoint (Polymarket CLOB/Gamma/Data, Kalshi, Limitless, Probable, Myriad) without leaving the unified SDK interface.
  - TypeScript: `await exchange.callApi('operationName', { param: 'value' })`
  - Python: `exchange.call_api('operation_name', {'param': 'value'})`
- **Low-Level API Reference Documentation**: Both Python and TypeScript API reference docs now include a comprehensive "Low-Level API Reference" section listing every available endpoint per exchange, with method, path, parameters, and auth requirements.

### Documentation

- **API Reference Templates**: Updated Handlebars templates and the doc generation pipeline to render per-exchange endpoint tables and detailed parameter listings from OpenAPI specs.

## [2.9.2] - 2026-02-19

### Documentation

- **Pagination Stability Guidance**: Clarified that repeated `fetchMarkets()` calls with different `offset` values do not guarantee stable ordering. Added guidance and examples on using `loadMarkets()` as the correct approach for stable iteration over the entire market catalog. (Closes #41)
- **Automatic Statistics**: Updated specific total download badges and metadata.

## [2.9.1] - 2026-02-18

### Documentation

- **Internal Links in API Reference**: Return types and complex parameters in the Python and TypeScript API reference documentation are now linkified. Clicking on a data model (e.g., `Order`, `UnifiedMarket`) now jumps directly to its detailed field definition at the bottom of the page.

## [2.9.0] - 2026-02-18

### Fixed

- **TypeScript SDK (Windows)**: Fixed a crash when spawning `pmxt-ensure-server` on Windows where the `.js` launcher must be invoked via `node` explicitly. The SDK now detects the platform and spawns `node <path>` when the resolved launcher ends in `.js`. (Closes #29)

### Added

- **Implicit API Generation**: Implemented automatic HTTP method generation from OpenAPI specifications in `BaseExchange`. Exchange classes can now register an OpenAPI spec and have typed HTTP methods created dynamically, significantly reducing boilerplate when adding new exchanges or API endpoints.
  - Added `ApiDescriptor` interface and `parseOpenApiSpec` utility.
  - Added `initAuth()` method for credential initialization and HMAC-SHA256 signing for Polymarket L2 API authentication.
  - API credentials are cached for synchronous signing operations.
  - Full implicit API support added to `PolymarketExchange` for all three services (CLOB, Gamma, Data APIs).

### Changed

- **Centralized Request Handling (`callApi`)**: Refactored all major exchange implementations (Kalshi, Polymarket, Limitless, Probable, Myriad) to route API calls through a unified `callApi` method on `BaseExchange`. This ensures consistent error mapping, logging, and interceptor behavior across all exchanges.
- **Consolidated Exchange Methods**: Moved standalone per-feature files (`fetchPositions.ts`, `fetchOrderBook.ts`, `fetchTrades.ts`, `fetchOHLCV.ts`) into their respective exchange class files. Deleted the now-redundant standalone files.
- **Centralized OpenAPI Specs**: Migrated API specifications from the root directory into structured `core/specs/` subdirectories (kalshi, limitless, myriad, polymarket, probable). The `fetch-openapi-specs` script now supports both remote URL fetching and local file reading.
- **Myriad**: Inlined `fetchTrades` logic directly into WebSocket polling and migrated to `callApi`. Fixed outcomeId parsing for composite IDs.
- **OpenAPI Utility**: Operations without explicit security definitions now correctly inherit top-level security settings.

### Documentation

- **SubParams in API Reference**: Sub-parameters for methods like `fetchMarkets` and `fetchEvents` (e.g., `query`, `slug`, `limit`, `offset`, `sort`, `searchIn`) are now rendered as nested bullet points directly under the method in both Python and TypeScript API reference docs.
- **Implicit API Pattern**: Added detailed documentation of the Implicit API pattern to `ARCHITECTURE.md`.
- **Exchange Integration Guide**: Refactored `core/ADDING_AN_EXCHANGE.md` to reflect the new `callApi`-based implementation approach.

## [2.8.0] - 2026-02-17

### Added

- **CCXT-Style Market Caching (`loadMarkets`)**: Implemented stateful market caching in `BaseExchange` to improve performance and enable synchronous-like metadata lookups.
  - New `loadMarkets(reload: boolean)` method fetches and caches all market definitions (by ID and slug).
  - Updated `fetchMarket` to check the local cache first, enabling 0ms lookups for frequently accessed markets.
  - Added `slug` property to `UnifiedMarket` for consistent multi-identifier caching.
- **Testing Infrastructure**: Added comprehensive unit tests and a cross-exchange manual verification script for the market caching system.

### Changed

- **Increased Default Market Limits**: Raised the default `fetchMarkets` limit from 10,000 to **250,000** results across Polymarket, Kalshi, and Limitless.

## [2.7.0] - 2026-02-17

### Changed

- **Centralized HTTP Architecture**: Refactored all major exchange clients (Polymarket, Kalshi, Limitless, Probable, Myriad) to route API requests through a shared `this.http` instance in `BaseExchange`.
- **Enhanced Verbose Logging**: The `exchange.verbose = true` flag now provides consistent, detailed logging for *all* HTTP requests and responses, including parameters, status codes, and error bodies across all exchanges.
- **Improved Internal Reliability**: 
  - Standardized error mapping and request interceptors across the library.
  - Fixed syntax errors and prop-drilling issues in Myriad and Probable exchange implementations.
  - Updated Kalshi unit tests to support robust `axios.create` mocking patterns.

## [2.6.0] - 2026-02-17

### Added

- **CCXT-Style Capability Map (`exchange.has`)**: Introduced a unified capability mapping system across all exchanges. This allows developers to programmatically check which features (e.g., `fetchOHLCV`, `watchOrderBook`, `createOrder`) are supported or emulated by a specific exchange.
  - Added the `.has` property to `BaseExchange` and all exchange implementations (Polymarket, Kalshi, Limitless, Probable, Myriad, Baozi).
  - New `/api/:exchange/has` endpoint in the sidecar server for remote capability discovery.
  - Python SDK updated to expose these capabilities on exchange instances.

### Changed

- **Repository & SDK Optimization**: Significantly reduced repository size and improved developer workflow by untracking generated server bundles in the Python SDK. These are now excluded from version control and managed during the build/dist process.
- **Improved Workspace Cleanliness**: Updated `.gitignore` and `.gitattributes` to ensure temporary files, generated SDK code, and build artifacts stay out of the repository.

### Fixed

- **Baozi**: Refined internal documentation regarding pari-mutuel odds calculation status.
- **Documentation**: Updated project statistics and download badges to reflect latest growth.

## [2.5.0] - 2026-02-16

### Added

- **Baozi Exchange Integration**: New exchange adapter for [baozi.bet](https://baozi.bet), a decentralized pari-mutuel prediction market on Solana. NOTE: Not fully working.
  - **Market Data**: `fetchMarkets`, `fetchEvents`, `fetchOrderBook` (synthetic from pool ratios).
  - **Trading**: `createOrder` via on-chain Solana instructions (`place_bet_sol` / `bet_on_race_outcome_sol`).
  - **Account Management**: `fetchBalance` (SOL), `fetchPositions` (PDA-based position lookup).
  - **Real-time Data**: `watchOrderBook` via Solana `onAccountChange` subscriptions.
  - Note: No `fetchOHLCV`, `fetchTrades`, or `cancelOrder` (pari-mutuel bets are irrevocable).

- **Myriad Markets Integration**: Full support for Myriad Markets, an AMM-based prediction market platform.
  - **Market Data**: `fetchMarkets`, `fetchEvents`, `fetchOHLCV`, `fetchOrderBook` (synthetic from AMM), `fetchTrades`.
  - **Trading**: `createOrder` (returns quote + calldata for on-chain execution), `fetchPositions`, `fetchBalance`.
  - **Real-time Data**: Poll-based `watchOrderBook` and `watchTrades`.
  - **Multi-chain Support**: Abstract (2741), Linea (59144), BNB (56) with composite IDs (`{networkId}:{marketId}:{outcomeId}`).
  - Key difference from CLOB exchanges: AMM-based, no limit orders or open order cancellation.

- **`fetchMarket` / `fetchEvent` Singular Lookup Methods**: Convenience methods for fetching a single market or event by ID, slug, or ticker. Throws `MarketNotFound` / `EventNotFound` if not found.
  - Extended `MarketFilterParams` with `marketId`, `outcomeId`, `eventId` for direct lookups.
  - Extended `EventFetchParams` with `eventId`, `slug` for direct lookups.
  - Exchange-specific implementations for Kalshi, Probable, and Limitless.

- **Improved Market Search**: Deduplication logic and exact-match fetching in parallel for Kalshi, Limitless, and Polymarket. Queries resembling tickers or slugs now prioritize exact matches.

### Fixed

- **Baozi**: Improved robustness of order parsing and position data.
- **Probable**: Added fallback lookup logic for slug search in `fetchMarkets`.

### Changed

- **Windows Compatibility**: Cross-platform process checking in LockFile and Python SDK.
- **Compliance Tests**: Enhanced with authentication support for Myriad and Baozi; refactored to use `initExchange` helper.
- **Generated SDK Code**: Now gitignored instead of committed.

## [2.4.0] - 2026-02-15

### Added

- **Probable Exchange Integration**: Initial release of the Probable exchange integration, bringing full support for the Probable prediction market platform.
  - **Market & Event Discovery**: Implemented `fetchMarkets` and `fetchEvents` for comprehensive market discovery.
  - **Trading**: Full trading support including `createOrder`, `cancelOrder`, `fetchOrder`, and `fetchOpenOrders`.
  - **Market Data**: Access to `fetchOrderBook`, `fetchTrades`, and `fetchOHLCV` for historical and real-time market analysis.
  - **Account Management**: Implemented `fetchBalance` and `fetchPositions` to track portfolio performance.
  - **Real-time Data**: Added WebSocket support for live order book updates via `watchOrderBook`. (Note: `watchTrades` is not yet supported).
  - **Examples**: Added comprehensive examples in `core/examples/api-reference` covering all major functionality.


## [2.3.0] - 2026-02-14

### Features

- **Outcome Shorthand for Trading**: You can now pass a `MarketOutcome` object directly to `createOrder` (TS) or `create_order` (Python) instead of manually specifying `marketId` and `outcomeId`.
- **`marketId` in `MarketOutcome`**: Market outcome objects now include the `marketId` they belong to, enabling the new shorthand functionality and better data traceability.

### Changed

- **Improved Type Safety**: Enhanced input validation for order creation to ensure consistent behavior across different parameter combinations.
- **Documentation & Examples**: Updated trading examples to demonstrate the new recommended shorthand pattern.

## [2.2.0] - 2026-02-14

### Features

- **MarketList Convenience Class**: Introduced a new `MarketList` class to simplify market discovery and filtering. This provides a more ergonomic way to search and interact with collections of markets across different exchanges.
- **Developer Experience**: Added `npm run dev` command to support streamlined local development with automatic rebuilding and sidecar management.

### Documentation

- **Architecture Overview**: Added a comprehensive `ARCHITECTURE.md` guide explaining the project's internal structure and core principles.
- **Exchange Contribution Guide**: Created `core/ADDING_AN_EXCHANGE.md` to provide clear instructions for developers looking to integrate new prediction markets.
- **Improved Onboarding**: Updated `CONTRIBUTING.md` with detailed monorepo structure and prerequisites. Added `.env.example` to simplify local environment setup.
- **Node.js Environment**: Explicitly defined supported Node.js versions in `package.json` to ensure development environment consistency.


## [2.1.3] - 2026-02-14

### Features

- **Polymarket Performance Optimization**:
  - Implemented `preWarmMarket` in the `PolymarketExchange` class. This allows for caching market metadata (such as `tokenAddress` and `negRisk` status) before placing orders, significantly reducing latency during critical execution moments.
  - Streamlined the `createOrder` workflow by removing redundant `inferTickSize` logic and delegating default handling to the Polymarket SDK.
- **API Enhancements**: Added support for the `negRisk` parameter in `CreateOrderParams`, enabling more granular control over order types on Polymarket. <-- not in openapi schema yet
- **Developer Experience**: Added a new benchmarking script `core/scripts/test-order-speed.ts` for measuring end-to-end order placement latency.

## [2.1.2] - 2026-02-13

### Fixed

- **Kalshi Pagination**: Implemented recursive pagination for Kalshi search, enabling the retrieval of up to 10,000 results per query (previously hard-limited to 200).
- **Kalshi 'All' Status**: Enhanced the `'all'` status filter to simultaneously fetch from `open`, `closed`, and `settled` endpoints, providing a truly comprehensive view of Kalshi events.
- **Polymarket Status Verification**: Added strict client-side status verification for Polymarket search to prevent "active" events from leaking into "closed" queries, ensuring high search precision.
- **Limitless Status Filtering**: Standardized status filtering for Limitless to correctly distinguish between active, expired, and resolved markets within search results.

### Changed

- **Unified Status Terminology**: Introduced `'inactive'` as a universal alias for `'closed'` across all exchange methods to provide a more intuitive API for non-binary market states.
- **Improved Documentation**: Enriched JSDoc metadata for `fetchMarkets` and `fetchEvents` with exchange-specific implementation details and usage examples.


## [2.1.1] - 2026-02-13

### Changed

- **Increased Default Limits**: The default limit for fetching markets and events has been increased to **10,000** results across all exchanges (Polymarket, Kalshi, Limitless) to provide more comprehensive search results by default.
- **Polymarket Search Optimization**: Migrated `fetchEvents` search to use the high-performance Gamma `public-search` endpoint with parallel pagination, significantly improving discovery for high-volume markets.
- **OpenAPI Specification**: Updated `openapi.yaml` to reflect the new default limit of 10,000 for market and event queries.

### Added

- **CI/CD Automation**: Integrated automated GitHub release creation and unified publishing logic in `publish.yml`.
- **Search Verification Tooling**: Added `core/verify_search.ts` script for easy testing and verification of search performance and accuracy.
- **Improved Metadata**: Updated `readme.md` with cross-linked documentation and refreshed project statistics.

### Fixed

- **Workflow Reliability**: Resolved YAML syntax errors in GitHub Actions and removed redundant scripts to streamline the deployment process.

## [2.1.0] - 2026-02-13

### Added

- **Status Filtering**: Introduced a unified `status` parameter (`active`, `closed`, `all`) for both `fetchMarkets` and `fetchEvents`. This allows querying resolved/archived markets in addition to active ones. (Closes #33)
  - **Polymarket**: Full support for active/closed filtering via Gamma API integration.
  - **Kalshi**: Implemented status-aware fetching with cache-isolation to prevent data pollution.
  - **Limitless**: Added compliance handling that returns empty results for closed markets (unsupported by the provider).
- **OpenAPI Specification**: Updated `MarketFilterParams` and `EventFetchParams` schemas to include the new `status` property.
- **Compliance Tests**: New test suite in `core/test/status-filtering.test.ts` ensuring correct parameter mapping and exchange-safe behavior.

## [2.0.11] - 2026-02-10

### Fixed

- **Limitless Pagination**: Implemented automatic pagination for limits greater than 25 markets. The Limitless API has a hard limit of 25 items per request, so this update introduces internal pagination that transparently handles any limit value. Over-fetches by 70% to account for ~33% of markets being filtered out due to missing tokens, then applies limit after filtering to ensure users get the exact requested number of valid markets. (Fixes #34)

## [2.0.10] - 2026-02-10

### Fixed

- **Polymarket WebSocket License**: Updated `@nevuamarkets/poly-websockets` dependency from AGPL-3.0 versions to MIT version, resolving license incompatibility warnings. Removed all AGPL-3.0 references from source code comments and error messages to ensure full MIT license compliance. (Fixes #35)

## [2.0.9] - 2026-02-09

### Fixed

- **Polymarket Pagination**: Implemented a parallel pagination utility for the Gamma API. This enables the discovery of events and markets beyond the first 500 results, ensuring high-volume and older markets are correctly indexed. (Fixes #37)

## [2.0.8] - 2026-02-08

### Changed

- **API Documentation**: Significantly refactored the API reference generation system. 
  - Introduced `extract-jsdoc.js` for more robust metadata extraction and multi-language example support.
  - Updated Handlebars templates for Python and TypeScript documentation.
  - Refined documentation and examples for all core exchange methods in `BaseExchange`.
- **BaseExchange Architecture**: Improved the `BaseExchange` class with enriched JSDoc metadata to better support the automated documentation pipeline.
- **CI/CD Pipeline**: Streamlined the testing process by unifying Core and Python test execution under the `npm test` command via `verify-all.sh`.

### Fixed

- **Python SDK Compatibility**: Migrated all remaining tests and examples in the Python SDK to the v2.0.0 API standards, fixing several integration regressions and ensuring full parity.
- **Limitless Exchange**: Refined parameter handling and data normalization for the Limitless implementation.

### Added

- **Project Metadata**: Updated download badges and workflow examples to reflect recent project updates and usage patterns.


## [2.0.7] - 2026-02-07

### Fixed

- **Python SDK**: Robust parsing for `resolution_date` in the `UnifiedMarket` model. The SDK now gracefully handles both ISO string formats (with "Z" or timezone offsets) and native `datetime` objects, preventing parsing errors for markets with irregular resolution data.

## [2.0.6f] - 2026-02-06

### Fixed

- **OHLCV Validation**: Added explicit runtime validation for the `resolution` parameter in `fetchOHLCV` to ensure API compliance and better error messaging.

## [2.0.5] - 2026-02-06

### Changed

- **Unified API Refined**: Split historical data parameters into `OHLCVParams` and `TradesParams` to better reflect their different nature.
  - `fetchOHLCV` now uses `OHLCVParams` (where `resolution` is required).
  - `fetchTrades` now uses `TradesParams` (where `resolution` is removed, as trades are discrete events).
- **TypeScript SDK**: Added dedicated interfaces for `OHLCVParams` and `TradesParams`.
- **Python SDK**: Updated type hints and documentation to reflect the refined parameter structure.
- **OpenAPI**: Updated specification with dedicated schemas for OHLCV and Trade parameters.

### Deprecated

- **`resolution` in `fetchTrades`**: The `resolution` parameter is now deprecated for trade history lookups and will be ignored. A console warning has been added for backward compatibility; it will be removed in v3.0.0.

## [2.0.2] & [2.0.3] & [2.0.4] - 2026-02-05


### Fixed

- **TypeScript SDK Build**: Fixed TypeScript compilation errors in generated SDK code caused by missing `instanceOf` function exports.
  - Added automatic post-processing script to patch OpenAPI-generated code.
  - Resolved `isolatedModules` TypeScript errors in core exchange modules (Kalshi, Limitless, Polymarket).
  - Changed `export` to `export type` for WebSocket config type re-exports.
- **CI/CD Pipeline**: Resolved build failures in GitHub Actions for npm package publishing.

### Note

- Version 2.0.1 remains valid for Python SDK (`pmxt`). This release (2.0.2) specifically addresses TypeScript SDK (`pmxtjs`) build issues.

## [2.0.1] - 2026-02-05

### Breaking Changes

- **Removed Deprecated Methods**: All previously deprecated methods have been removed as part of the v2.0.0 cleanup.
  - `searchMarkets(query, params)`: Use `fetchMarkets({ query, ...params })` instead.
  - `getMarketsBySlug(slug)`: Use `fetchMarkets({ slug })` instead.
  - `searchEvents(query, params)`: Use `fetchEvents({ query, ...params })` instead.
- **Removed Deprecated Fields**: Removed the deprecated `.id` field from `UnifiedMarket` and `MarketOutcome` models. Use `.marketId` and `.outcomeId` instead.
- **Python SDK Signature Changes**: Refactored Python SDK to use direct keyword arguments instead of params dictionary.
  - `fetch_ohlcv` and `fetch_trades` now use kwargs for cleaner API calls.
  - All methods now follow the pattern: `method(arg1, arg2, key1=value1, key2=value2)` instead of `method(arg1, arg2, params={'key1': value1})`.

### Added

- **Limitless WebSocket Support**: Implemented real-time WebSocket streaming for Limitless exchange.
  - Added `watchOrderBook` and `watchTrades` support for live market data.
  - WebSocket connection management with automatic reconnection.
- **Limitless On-Chain Balances**: Added on-chain balance fetching capability for Limitless exchange.
  - Queries blockchain directly for accurate balance information.
  - Integrated with Limitless SDK for seamless balance retrieval.
- **Unified Error Handling System**: Implemented a comprehensive error handling system across all exchanges.
  - Consistent error messages and status codes across Polymarket, Kalshi, and Limitless.
  - Improved error mapping for better debugging and troubleshooting.
  - More robust compliance tests with proper error detection.
- **Polymarket Signing Updates**: Enhanced Polymarket initialization with new authentication options.
  - Added `proxyAddress` parameter for explicit proxy wallet configuration.
  - Added `signatureType` parameter with support for "gnosis-safe" (default), "polyproxy", and "eoa".
  - Updated examples to demonstrate new signing methods.

### Changed

- **Migration to Unified API**: Completed migration to CCXT-style API patterns as outlined in `MIGRATION.md`.
  - All exchanges now use consistent parameter patterns with unified `params` objects (TypeScript) or keyword arguments (Python).
  - Improved API consistency across all supported exchanges.
- **Updated Examples**: Refactored all examples in `examples/` directory to use v2.0.0 API patterns.
  - Removed legacy method calls and deprecated patterns.
  - Added examples demonstrating new Polymarket signing configuration.
  - Updated models and data structures throughout.
- **OpenAPI Documentation**: Updated OpenAPI specification to include:
  - Limitless WebSocket endpoints and methods.
  - Missing methods from previous versions.
  - Corrected parameter definitions and response schemas.
- **Limitless Documentation**: Improved Limitless exchange documentation with clearer setup instructions and API usage examples.

### Fixed

- **TypeScript Build Errors**: Resolved TypeScript compilation errors related to Limitless WebSocket implementation and server bundle generation.
- **Python Error Parsing**: Fixed error parsing issues in the Python SDK that were causing incorrect error messages.
- **Limitless Search Functionality**: Fixed semantic search parameters and query handling for Limitless markets.
  - Corrected parameter mapping for search endpoints.
  - Improved search result relevance and accuracy.
- **Compliance Test Improvements**: Enhanced compliance test suite across all exchanges.
  - Replaced deprecated `.id` with `.outcomeId` and `.marketId` in all tests.
  - Improved error status and message detection for Kalshi `fetchOrder` tests.
  - Updated `fetchOrderBook` tests and reduced Limitless logging noise.
  - Increased `fetchMarkets` timeout to 120s for Kalshi to handle slower API responses.
  - Changed market fetch limit to 25 for better test reliability.
  - Fixed `fetchMarket` tests to properly handle Kalshi's data structure.
- **Verbose Logging**: Removed excessive verbose logging from sidecar API, providing cleaner console output during normal operations.

### Improved

- **Error Handling Robustness**: Significantly improved error detection, mapping, and reporting across all exchanges.
- **Test Reliability**: Enhanced compliance test suite with better timeout handling and more robust assertions.
- **Code Quality**: Removed all deprecated code paths, resulting in cleaner and more maintainable codebase.
- **Documentation Quality**: Updated README with authentication introduction and clearer getting started instructions.

### Migration Guide

For TypeScript users upgrading from v1.7.0:
```typescript
// v1.7.0 (deprecated methods)
const markets = await exchange.searchMarkets("Trump", { limit: 10 });
const market = await exchange.getMarketsBySlug("trump-wins-2024");

// v2.0.0 (unified API)
const markets = await exchange.fetchMarkets({ query: "Trump", limit: 10 });
const market = await exchange.fetchMarkets({ slug: "trump-wins-2024" });

// v1.7.0 (deprecated field)
console.log(market.id);

// v2.0.0 (use specific ID fields)
console.log(market.marketId);
console.log(outcome.outcomeId);
```

For Python users upgrading from v1.7.0:
```python
# v1.7.0 (params dictionary)
candles = exchange.fetch_ohlcv(market_id, timeframe, params={'start': start_time})

# v2.0.0 (keyword arguments)
candles = exchange.fetch_ohlcv(market_id, timeframe, start=start_time)

# v1.7.0 (deprecated field)
print(market.id)

# v2.0.0 (use specific ID fields)
print(market.market_id)
print(outcome.outcome_id)
```

Polymarket initialization with new signing options:
```typescript
// v2.0.0 (explicit proxy configuration)
const poly = new Polymarket({
  credentials: {
    privateKey: "0x...",
    proxyAddress: "0x...",  // Optional: your proxy wallet address
    signatureType: "gnosis-safe"  // Optional: "gnosis-safe" (default), "polyproxy", or "eoa"
  }
});
```

## [2.0.0] - 2026-02-05
Invalid

## [1.7.0] - 2026-02-03

### Added
- **Unified API Consolidation**: Consolidated `searchMarkets()`, `getMarketsBySlug()`, and `searchEvents()` into new CCXT-style `fetchMarkets()` and `fetchEvents()` methods.
  - New methods accept a unified `params` object (TS) or keyword arguments (Python).
  - Supports `query` and `slug` as standard parameters.
- **Improved CCXT Compatibility**: Aligned the API structure more closely with the CCXT standard for easier cross-platform migration.

### Deprecated
- `searchMarkets(query, params)`: Use `fetchMarkets({ query, ...params })` instead.
- `getMarketsBySlug(slug)`: Use `fetchMarkets({ slug })` instead.
- `searchEvents(query, params)`: Use `fetchEvents({ query, ...params })` instead.
- These methods will be removed in v2.0. Deprecation warnings have been added.

### Improved
- **BaseExchange Architecture**: Moved search routing logic into the `BaseExchange` class to reduce duplication across exchange implementations.
- **Example Modernization**: All core and SDK examples updated to use the new unified API patterns.
- **Test Coverage**: Added compliance tests for the new `fetchMarkets` and `fetchEvents` implementations.

## [1.6.0] - 2026-02-03

### Added
- **Filtering**: Introduced a client-side filtering system for both Python and TypeScript SDKs.
  - `filterMarkets` / `filter_markets`: Filter markets by text (search in title, description, category, tags, or outcomes), volume (24h or total), liquidity, open interest, resolution date, and pricing.
  - `filterEvents` / `filter_events`: Filter events by text, category, tags, market count, and total volume.
  - Support for custom predicate functions (lambdas) for unlimited filtering flexibility.
- **Server Management Utilities**: Added global convenience functions to manage the PMXT background process.
  - `stop_server()` / `stopServer()`: Programmatically shut down the sidecar server.
  - `restart_server()` / `restartServer()`: Quickly refresh the server state.
- **Comprehensive Testing**: Added extensive unit tests for the filtering engine in both SDKs and the core library.

### Improved
- **Documentation**: Updated the API Reference and README to include details on the new filtering capabilities and server utilities.
- **Download Badges**: Refreshed statistics to accurately reflect project growth across npm and PyPI.

## [1.5.7] - 2026-02-01

### Added
- **Fee Support for CreateOrder**: Added a `fee` parameter to `CreateOrderParams`.
- **Polymarket Fee Handling**: Implemented mandatory fee rates (e.g., 1000 for 0.1%) for Polymarket orders. This enables trading on high-frequency markets like "Bitcoin Up/Down" which require a fee rate.

### Fixed
- **API Parity**: Ensured `fee` field consistency across Python SDK, TypeScript SDK, and core sidecar server.

## [1.5.6] - 2026-02-01

### Added
- **Polymarket Proxy Auto-Discovery**: The SDK now automatically identifies Gnosis Safe, PolyProxy, and EOA account types by querying the Polymarket Data API, reducing manual configuration.
- **Robust Balance Fallback**: Implemented an on-chain USDC balance check for Polymarket that triggers if the CLOB API returns zero, ensuring accurate fund reporting even during API desyncs.
- **Explicit Proxy Configuration**: Added `funderAddress` (proxy address) and `signatureType` to exchange credentials in both TypeScript and Python SDKs for manual overrides.
- **OpenAPI Schema Updates**: Exposed proxy configuration fields in the sidecar server API.

### Fixed
- **Polymarket Balance Accuracy**: Resolved critical issues where proxy-based accounts were incorrectly reporting zero balance.
- **Polymarket Order Placement**: Fixed signing issues for proxy accounts by ensuring the correct funder address and signature type are used during CLOB client initialization.
- **Limitless Account Configuration**: Added support for proxy addresses and custom signature types in Limitless exchange.

### Improved
- **Python SDK Parity**: Updated the Python `Polymarket` and `Limitless` clients to support the new proxy and signature configuration options.

## [1.5.5] - 2026-02-01

### Fixed
- **Kalshi Trading Reliability**: Resolved a critical URL mismatch in `createOrder` that caused order placement to fail in some environments.
- **TypeScript Integration Tests**: Fixed syntax errors in `tests/integration.test.ts` that were preventing the SDK verification suite from running cleanly.
- **Compliance Handling**: Updated `fetchTrades` compliance tests to gracefully handle exchanges that return "Not Implemented" instead of failing the test suite.
- **Order Fetching**: Fixed intermittent `TypeError` issues in `fetchOrder` (specifically for Polymarket) when handling orders with missing side information.

### Improved
- **Kalshi WebSocket Stability**: Enhanced the `watchTrades` compliance test with smarter market selection (targeting high-volume markets) to eliminate false-positive timeouts.

## [1.5.3 / 1.5.4] - 2026-01-31

### Added
- **Limitless Order Cancellation**: Implemented `cancelOrder` support for Limitless exchange.
- **Compliance Hardening**: Comprehensive update to compliance testing suite:
  - Added dynamic skipping for tests requiring missing credentials.
  - Implemented real `createOrder` tests for all exchanges.
  - Removed mocks in favor of live API verification.

### Fixed
- **Polymarket Trades**: Switched `fetchTrades` to use the public Data API (`/activity`), resolving 503 errors and parameter mismatches.
- **Limitless Reliability**:
  - Filtered out invalid "outcome-less" markets in `fetchMarkets`.
  - Fixed `fetchTrades` to return empty list instead of throwing when no trades exist.
  - Fixed `fetchOHLCV` compliance test and status.
  - Explicitly disabled WebSocket tests as they are not supported.
- **Kalshi Configuration**: Updated default API endpoint to `api.elections.kalshi.com`.

## [1.5.2] - 2026-01-30

### Fixed
- **Limitless Group Markets**: Resolved an issue where hierarchical `searchEvents` on Limitless failed to discover nested markets within "Group" structures.
- **Search Robustness**: Added safety checks for missing market descriptions during search to prevent runtime errors.

## [1.5.1] - 2026-01-30

### Added
- **Limitless SDK Exposure**: Exposed the `Limitless` exchange class in both Python (`pmxt.Limitless`) and TypeScript (`import { Limitless } from 'pmxtjs'`) SDKs, bringing them to parity with the core implementation.

## [1.5.0] - 2026-01-30

### Added
- **Limitless Exchange**: Full integration with Limitless API, including market fetching, trading, and order book management.
  - Features consolidated endpoints and dynamic tick size handling.
- **Example Updates**: Refactored examples to remove boilerplate and use the new search DX.

### Fixed
- **Limitless Tests**: Resolved test failures for Limitless exchange integration.
- **Limitless WebSockets**: Explicitly disabled WebSockets for Limitless (not supported in v1) to prevent runtime errors.
- **Limitless Tick Size**: Implemented dynamic tick size to support various markets on Limitless.

## [1.4.1] - 2026-01-30

### Fixed
- **Windows Core Support**: Resolved a critical `[WinError 193]` issue that prevented the sidecar server from launching on Windows.
  - Implemented explicit `node` execution for the server launcher on Windows.
  - Added `.js` extension aliases for core binary scripts to ensure compatibility with Windows file associations.
- **Server Lifecycle**: Improved the `pmxt-ensure-server` launcher to perform a proactive health check even if a stale lock file is present, ensuring the server is actually responsive before returning.
- **Python SDK Launcher Selection**: Optimized the `ServerManager` to prioritize bundled launchers with platform-specific extensions, resolving environment-specific discovery issues.

### Added
- **Cross-Platform Testing**: Introduced a new test suite (`sdks/python/tests/test_server_manager.py`) to verify SDK launcher logic across different operating systems.
- **Bundling Automation**: Updated `bundle_server.py` to automatically generate Windows-compatible entry points during the build process for the Python package.

### Improved
- **Setup Documentation**: Updated the main README with explicit requirements for Node.js availability on the system PATH, specifically for Windows users.

## [1.4.0] - 2026-01-30

### Added
- **Best Execution Price Helper**: Introduced new helper methods to both Python and TypeScript SDKs to calculate volume-weighted average prices based on current order book liquidity.
  - `getExecutionPrice(orderBook, side, amount)`: Returns the average price for a specific size.
  - `getExecutionPriceDetailed(...)`: Returns structured data including total filled amount and whether the order could be fully filled.
- **Universal `getMarketsBySlug`**: Added a reliable way to fetch markets using URL slugs (Polymarket) or event tickers (Kalshi). This simplifies deep-linking and integration with external sources.
- **Execution Price Examples**: Added comprehensive examples in `examples/market-data/` for both languages (`execution_price.py` and `execution_price.ts`).
- **New Data Models**: Added `ExecutionPriceResult` (TS) and `ExecutionPriceResult` (Python) models for strongly typed price calculation results.

### Improved
- **Financial Math Logic**: Implemented robust floating-point handling and sorting for execution price calculations to ensure consistency across exchanges.
- **Base Exchange Class**: Promoted `getMarketsBySlug` to the base `PredictionMarketExchange` class for improved code sharing and API consistency.
- **OpenAPI Synchronization**: Updated the sidecar's OpenAPI specification to include the new execution price endpoints.

### Fixed
- **Precision Errors**: Resolved subtle floating-point precision issues in cumulative volume calculations when traversing deep order books.

## [1.3.4] - 2026-01-29

### Added
- **In-Event Search (Python & TS)**: Implemented the `search_markets` (Python) and `searchMarkets` (TS) methods on `UnifiedEvent` objects. This allows for fast, contextual filtering of markets within a specific event, matching the pattern described in the README.
- **TypeScript `searchEvents`**: Added the `searchEvents` method to the TypeScript `Exchange` class to provide full parity with the Python implementation.

### Fixed
- **Python SDK NameError**: Fixed a `NameError` in the Python SDK where `SearchIn` and other Literal types were used before being defined in `models.py`.
- **TypeScript Protected Access**: Resolved a lint error in the TypeScript SDK where protected configuration members were being accessed incorrectly in the manual `searchEvents` implementation.
- **API Parity**: Fixed discrepancies between the documentation and the actual SDK implementations for both Python and TypeScript hierarchical search features.

## [1.3.3] - 2026-01-29

### Added
- **Python SDK Parity**: Implemented the `search_events` method in the Python SDK, bringing it to full parity with the TypeScript implementation introduced in v1.3.1.
- **UnifiedEvent Model**: Added the native `UnifiedEvent` dataclass to the Python SDK for better type safety when using hierarchical search.
- **Semantic Aliases**: Added a `.question` property alias to `UnifiedMarket` in the Python SDK, matching common developer expectations for prediction market queries.

### Fixed
- **Python SDK API Calls**: Fixed a regression where hierarchical search endpoints were missing from the auto-generated internal API client by implementing a robust manual fallback.

## [1.3.2] - 2026-01-29

### Fixed
- **Python SDK Bundled Server**: Updated the internal bundled sidecar server to the latest version. This resolves a regression where the "Date Handling in OHLCV" fix (from v1.1.3) was not correctly applied in the Python distribution, causing `getTime is not a function` errors when fetching historical data.

### Improved
- **CI/CD**: Added an automated step to the GitHub Actions workflow to rebuild and bundle the sidecar server immediately before publishing the Python package, ensuring the PyPI distribution always contains the latest core server code.

## [1.3.1] - 2026-01-29

### Added
- **Hierarchical Search API**: Introduced a new, cleaner way to discover markets via the `searchEvents` method.
  - **Contextual Grouping**: `searchEvents` returns `UnifiedEvent` objects that group related markets (e.g., all candidates in the same election).
  - **In-Event Search**: Added `event.searchMarkets(query)` to result objects for fast, contextual filtering.
  - **Unified Support**: Implemented for both Polymarket (Gamma API) and Kalshi (Events API).
- **OpenAPI Updates**: Exposed the new `/searchEvents` endpoint and `UnifiedEvent` schema in the sidecar server documentation.

### Improved
- **Developer Experience (DX)**: Updated the README Quickstart to prioritize the new hierarchical search pattern, reducing boilerplate for common tasks.
- **Documentation**: Simplified the main README for both Python and TypeScript, clearly explaining the **Event -> Market -> Outcome** data hierarchy.
- **Build Infrastructure**: Hardened `verify-all.sh` to handle monorepo version mismatches more gracefully during local development by making `npm install` conditional.

## [1.2.0] - 2026-01-29

### Added
- **Unified Semantic Shortcuts**: Introduced convenience properties for binary markets across all SDKs (Python and TypeScript).
  - **New Properties**: `market.yes`, `market.no`, `market.up`, and `market.down`.
  - **Intelligent Mapping**: Implemented shared core logic to automatically identify "Yes" vs "No" outcomes based on labels and common patterns (e.g., "Not X" pairs).
  - **Expressive Aliases**: Added `.up` and `.down` as semantic aliases for `.yes` and `.no` to improve readability for directional markets.

### Improved
- **Core Architecture**: Extracted market normalization logic into a shared utility to ensure absolute parity between exchange implementations.
- **SDK Parity**: Updated both auto-generated and handcrafted portions of the Python and TypeScript SDKs to expose the new fields with full type hinting.

## [1.1.4] - 2026-01-27

### Fixed
- **Timezone Handling**: Hardened date parsing to treat naive ISO strings (typically from Python's `datetime.utcnow()`) as UTC. This prevents timezone shifts when querying historical data across the sidecar interface.

### Improved
- **Polymarket OHLCV**: Implemented robust client-side candle aggregation for Polymarket price history.
  - Previously: The endpoint returned raw trade/tick data points which could be noisy or misaligned.
  - Now: Data is properly bucketed into time intervals (candles) with accurate Open, High, Low, Close, and Volume calculations.

## [1.1.3] - 2026-01-27

### Fixed
- **Date Handling in OHLCV**: Fixed a critical issue where the Python SDK (which serializes datetime objects as strings) was causing "getTime is not a function" errors in the TypeScript sidecar.
  - Implemented robust date parsing middleware in `fetchOHLCV` for both Polymarket and Kalshi exchanges.
  - The sidecar server now correctly accepts both native `Date` objects (from internal TS calls) and ISO 8601 strings (from external APIs/SDKs) for `start` and `end` parameters.

## [1.1.1] - 2026-01-25

### Fixed
- **Server Lifecycle**: Resolved a critical race condition where multiple concurrent client instantiations (e.g., initializing both Polymarket and Kalshi simultaneously) would kill and restart the sidecar server, invalidating access tokens.
- **Version Detection**: Improved `package.json` discovery in the sidecar server to ensure correct version reporting in bundled environments.
- **SDK Stability**: Updated the Python `ServerManager` to be more tolerant of version suffixes (like `-b4` or `-dev`), preventing unnecessary server restarts during development.

## [1.1.0] - 2026-01-25

### Added
- **Unified WebSocket Support**: Introduced real-time streaming capabilities for prediction markets via a standardized interface.
  - **New Methods**: Added `watchOrderBook(id)` and `watchTrades(id)` following the CCXT Pro pattern for real-time data ingestion.
  - **Kalshi WebSocket**: Implemented native WebSocket support for Kalshi, including real-time order book snapshots, incremental deltas, and trade feeds.
  - **Polymarket CLOB WebSocket**: Integrated with Polymarket's Central Limit Order Book (CLOB) WebSocket for low-latency market updates.
  - **Sidecar Integration**: Real-time methods are now accessible via the sidecar server, enabling streaming support across Python and TypeScript SDKs.
- **Examples**: Added comprehensive WebSocket examples in `examples/market-data/`:
  - `watch_orderbook_kalshi.ts` / `watch_orderbook_polymarket.ts`
  - `watch_trades_kalshi.ts` / `watch_trades_polymarket.ts`

### Changed
- **Data Normalization**: Enhanced market ID resolution to ensure consistency between REST snapshots and WebSocket update streams.
- **Kalshi Order Book Logic**: Optimized the internal book builder to automatically handle Kalshi's "bids-only" data format by synthesizing asks from inverse outcomes.

### Fixed
- **Build Infrastructure**: Resolved "missing dependency" errors by adding `ws` and `@types/ws` to the core package.
- **Connection Stability**: Improved WebSocket reconnection logic and error handling to manage network disruptions gracefully.
- **Type Definitions**: Fixed several edge-case TypeScript errors in WebSocket event handlers.

## [1.0.4] - 2026-01-22

### Added
- **Sidecar Security**: Implemented a secure handshake protocol between the SDK and the Node.js sidecar server to prevent unauthorized access.
- **Auto-Restart Handshake**: Added logic to automatically detect sidecar crashes and restart the process seamlessly.

### Fixed
- **Kalshi Pagination**: Fixed a critical bug in `fetchMarkets` where the `offset` parameter was incorrectly ignored, enabling full traversal of Kalshi's market catalog.
- **Metadata Management**: Improved reliability of internal metadata enrichment for Polymarket results.

## [1.0.3] - 2026-01-17

### Added
- **Zero-Config SDK Installation**: The sidecar server (`pmxt-core`) is now bundled directly within the SDK distributions, enabling a single-command setup experience.
  - **Python**: Bundled the server logic into the `pmxt` package on PyPI.
  - **TypeScript**: Added `pmxt-core` as a direct dependency for `pmxtjs`.
- **Project Statistics**: Introduced a programmatic "Total Downloads" badge in the README that aggregates data from both npm and PyPI.
- **Automation**: Implemented a GitHub Action to automatically update repository statistics and download counts.

### Changed
- **Branding**: Switched to a unified "version" badge in the documentation to reflect cross-platform consistency.
- **Server Discovery**: Updated the `pmxt-ensure-server` utility to intelligently detect bundled server locations in various environment types (venv, global, etc.).

### Fixed
- **Broken Documentation Links**: Resolved several dead links in the API Reference and Examples sections.
- **Installation Footprint**: Optimized the bundled server footprint for faster SDK installs.

## [1.0.2] - 2026-01-17

broken

## [1.0.1] - 2026-01-17

### Fixed
- **Core SDK (Universal)**: Implemented dynamic port detection via the `~/.pmxt/server.lock` file. This resolves `ConnectionRefusedError` issues when the default port (3847) is already in use and the server falls back to an alternative port.
- **TypeScript SDK**: Resolved a critical race condition where API calls could be executed before the internal server manager had finished starting the sidecar or detecting the actual running port. Standardized the initialization pattern using an internal `initPromise`.
- **TypeScript SDK**: Fixed `ServerManager` health checks to correctly target the dynamically detected port instead of always checking the default.
- **Python SDK**: Hardened the `ServerManager` logic and improved consistency with the TypeScript implementation.

### Added
- **Python**: Added `examples/test_port_detection.py` to demonstrate and verify the new dynamic port resolution logic.

## [1.0.0] - 2026-01-17

### Major Release: Multi-Language SDK Support

This release represents a complete architectural transformation of pmxt, introducing **multi-language support** through a unified sidecar architecture. The project has evolved from a TypeScript-only library to a comprehensive multi-language ecosystem with official Python and TypeScript SDKs.

### Breaking Changes

- **Monorepo Structure**: The project has been restructured into a monorepo with separate packages:
  - `pmxt-core`: Core Node.js server with aggregation logic
  - `pmxtjs`: TypeScript/JavaScript SDK (npm)
  - `pmxt`: Python SDK (PyPI)
- **Package Names**: The npm package remains `pmxtjs`, but the internal structure has changed significantly
- **Import Paths**: TypeScript SDK now uses a wrapper architecture with automatic server management

### Added

#### Python SDK (`pmxt`)
- **Official Python Support**: First-class Python SDK with full feature parity with TypeScript
- **Automatic Server Management**: Python SDK automatically starts and manages the Node.js sidecar server
- **Native Python API**: Pythonic interface with type hints and async support
- **PyPI Distribution**: Published to PyPI as `pmxt` package
- **Comprehensive Examples**: Python examples for all major features (market data, trading, account management)
- **Auto-generated Documentation**: Language-specific API reference documentation

#### Sidecar Architecture
- **Local Express Server**: Core aggregation logic runs as a local HTTP server (port 3847)
- **OpenAPI Specification**: Complete OpenAPI 3.0 schema for all endpoints
- **Health Checks**: Built-in health monitoring and server lifecycle management
- **Automatic Startup**: SDKs automatically start the server when needed
- **Process Management**: Graceful shutdown and cleanup of background processes

#### Infrastructure & Automation
- **OpenAPI Code Generation**: Automated SDK generation from OpenAPI spec using `openapi-generator`
- **Multi-Language CI/CD**: Unified GitHub Actions workflow for publishing to both npm and PyPI
- **Automated Version Management**: Script-based version synchronization across all packages
- **Beta Release Pipeline**: Support for beta releases with dynamic npm tagging
- **Integration Testing**: Comprehensive test suite verifying SDK-to-core compatibility
- **Automated Documentation**: Template-based API documentation generation for each language

#### Core Improvements
- **Per-Request Credentials**: Support for passing credentials on a per-request basis
- **Optimized Kalshi Fetching**: Improved performance for Kalshi market data retrieval
- **Enhanced Type Safety**: Complete TypeScript types for all data models
- **Schema Synchronization**: OpenAPI schema now fully synchronized with core TypeScript types

#### Documentation
- **Language-Specific Docs**: Separate API references for Python and TypeScript
- **Setup Guides**: Detailed setup instructions for both SDKs
- **Testing Guide**: Comprehensive testing documentation (`TESTING.md`)
- **Beta Release Guide**: Documentation for beta release process (`BETA_RELEASE.md`)
- **Contributing Guide**: Updated contribution guidelines for monorepo structure
- **Roadmap**: Updated roadmap reflecting v1.0.0 completion and future plans

### Changed

- **Repository Structure**: Migrated to monorepo with `core/`, `sdks/python/`, and `sdks/typescript/` directories
- **Build Process**: Separate build pipelines for each package with proper dependency management
- **Testing Strategy**: Multi-tier testing (unit, integration, SDK verification)
- **Version Management**: Centralized version management across all packages
- **Repository URLs**: Updated to `pmxt-dev/pmxt` organization for provenance verification
- **License Holder**: Updated copyright holder in LICENSE file

### Fixed

- **ESM/CJS Interoperability**: Implemented dual build (CommonJS/ESM) for TypeScript SDK
  - Fixed "double default" issue in ES Module environments
  - Added `.js` extensions to imports in ESM build
  - Proper `exports` field configuration in `package.json`
- **OpenAPI Schema Sync**: Resolved discrepancies between OpenAPI spec and core types
  - Added missing properties (`resolutionDate`, `metadata`, etc.)
  - Fixed enum types for `Order.status` and similar fields
  - Ensured all SDK-generated models match actual data structures
- **Python Versioning**: Implemented PEP 440 compliant version format for Python packages
- **Build Order Issues**: Resolved TypeScript SDK build dependencies and compilation order
- **Port Configuration**: Standardized on port 3847 with proper health check endpoints
- **CI Build Errors**: Fixed isolated TypeScript generation and build configuration issues

### Technical Details

#### Architecture
The new sidecar architecture works as follows:
1. **Core Server**: Node.js Express server (`pmxt-core`) runs locally and handles all exchange integrations
2. **SDK Clients**: Language-specific SDKs (Python, TypeScript) communicate with the core server via HTTP
3. **Auto-Management**: SDKs automatically start/stop the server as needed
4. **Type Safety**: OpenAPI specification ensures type consistency across all languages

#### Package Versions
- `pmxt-core`: 1.0.0
- `pmxtjs`: 1.0.0
- `pmxt` (Python): 1.0.0

#### Migration from v0.4.4
For TypeScript users:
```typescript
// v0.4.4 (still works)
import pmxt from 'pmxtjs';
const poly = new pmxt.Polymarket();

// v1.0.0 (same API, new architecture)
import pmxt from 'pmxtjs';
const poly = new pmxt.Polymarket();
```

For Python users (new):
```python
import pmxt

poly = pmxt.Polymarket()
markets = poly.search_markets("Trump")
```

### Known Limitations

- **Node.js Dependency**: Both SDKs require Node.js to be installed (for the sidecar server)
- **Beta Features**: Some advanced features are still in beta (see `BETA_RELEASE.md`)
- **Exchange Coverage**: Currently supports Polymarket and Kalshi (more exchanges planned for v1.x.x)

### Acknowledgments

This release represents a major milestone in making prediction market data accessible across all major programming languages. Special thanks to all contributors and early testers who helped shape this architecture.

---
 
## [0.4.4] - 2026-01-15

### Fixed
- **ESM Import Compatibility**: Fixed an issue where `import pmxt from 'pmxtjs'` in ES Module environments (e.g., Node.js with `"type": "module"`) would wrap the default export in an extra `.default` property, breaking the expected `pmxt.polymarket()` syntax. Added explicit named exports (`polymarket`, `kalshi`) to ensure proper CommonJS/ESM interoperability.

### Added
- **Named Exports**: You can now import exchanges directly using named imports: `import { polymarket, kalshi } from 'pmxtjs'` in addition to the default `import pmxt from 'pmxtjs'` syntax.

## [0.4.3] - 2026-01-15

### Fixed
- **Zombie Files in `dist/`**: Implemented a `prebuild` step that automatically cleans the `dist/` folder before every build. This prevents "stuck on old code" issues on macOS/Windows caused by file-to-directory refactors (e.g., `Kalshi.js` becoming `kalshi/index.js`).

### Added
- **Automated Publishing**: Added GitHub Actions workflow to automatically build and publish to npm whenever a new repository tag (e.g., `v0.4.3`) is pushed.

## [0.4.2] - 2026-01-15

### Fixed
- **Kalshi Description Field**: Corrected a mapping issue where the unified `description` field was being populated with `event.sub_title` or `market.subtitle` (which typically only contain dates). It now correctly uses `market.rules_primary`, providing the actual resolution criteria as intended.

## [0.4.1] - 2026-01-15

### Fixed
- **Kalshi Metadata Enrichment**: Fixed a major data gap where Kalshi markets were returning empty `tags`. 
  - **The Issue**: The Kalshi `/events` and `/markets` endpoints do not expose tags. Tags are instead nested under the `/series` metadata, which wasn't being queried.
  - **The Fix**: Implemented a secondary fetch layer that retrieves Series metadata and maps it back to Markets.
  - **Unified Tags**: Standardized the provider data model by merging Kalshi's `category` and `tags` into a single unified `tags` array, ensuring consistency with Polymarket's data structure.

### Changed
- **Kalshi Implementation**: Modified `fetchMarkets` to fetch Series mapping in parallel with events and `getMarketsBySlug` to perform atomic enrichment.

## [0.4.0] - 2026-01-13

### Added
- **Trading Support**: Added full trading support for **Polymarket** and **Kalshi**, including:
  - Order management: `createOrder`, `cancelOrder`, `fetchOrder`, `fetchOpenOrders`.
  - Account management: `fetchBalance`, `fetchPositions`.
- **Tests**: Added comprehensive unit and integration tests for all trading operations.
- **Examples**: Added new examples for trading and account data (e.g., `list_positions`).

### Changed
- **Architecture**: Refactored monolithic `Exchange` classes into modular files for better maintainability and scalability.
- **Authentication**: Simplified Polymarket authentication workflow.
- **Documentation**: Updated `API_REFERENCE.md` with detailed trading and account management methods.

### Fixed
- **Jest Configuration**: Resolved issues with ES modules in dependencies for testing.
- **Kalshi Implementation**: Fixed various bugs such as ticker formatting and signature generation.

### CRITICAL NOTES
- Polymarket has been tested manually, and works.
- Kalshi HAS NOT been tested manually but has been implemented according to the kalshi docs.

## [0.3.1] - 2026-01-11

### Added
- **Search Scope Control**: Added `searchIn` parameter to `searchMarkets` allowing 'title' (default), 'description', or 'both'.

### Changed
- **Default Search Behavior**: `searchMarkets` now defaults to searching only titles to reduce noise and improve relevance.
- **Improved Search Coverage**: Increased search depth for both Polymarket and Kalshi to cover all active markets (up to 100,000) instead of just the top results.

### Fixed
- **Documentation**: Updated README Quick Example to be robust against empty results.

## [0.3.0] - 2026-01-09

### Breaking Changes
- **CCXT Syntax Alignment**: Renamed core methods to follow `ccxt` conventions:
  - `getMarkets` -> `fetchMarkets`
  - `getOrderBook` -> `fetchOrderBook`
  - `getTradeHistory` -> `fetchTrades`
  - `getMarketHistory` -> `fetchOHLCV`
- **Namespace Support**: Implemented `pmxt` default export to allow usage like `pmxt.polymarket`.

### Improved
- **Kalshi OHLCV**: Enhanced price mapping and added mid-price fallback for historical data.
- **Examples**: Updated `historical_prices.ts` to use new method names and improved logic.

### Fixed
- **Type Definitions**: Updated internal interfaces to match the new naming scheme.
- **Documentation**: Updated test headers and file references.

## [0.2.1] - 2026-01-09

### Fixed
- **Test Suite**: Added missing `ts-jest` dependency to ensure tests run correctly.
- **Search Robustness**: Fixed a potential crash in `searchMarkets` for both Kalshi and Polymarket when handling markets with missing descriptions or titles.
- **Data Validation**: Added better error handling for JSON parsing in Polymarket outcomes.

## [0.2.0] - 2026-01-09

### Breaking Changes
- **Unified Deep-Dive Method IDs**: Standardized the IDs used in deep-dive methods across exchanges to ensure consistency. This changes the return signatures of data methods.

### Improved
- **Examples**: Simplified and fixed examples, including `historical_prices`, `orderbook_depth`, and `search_grouping`, to better demonstrate library usage.
- **Example Data**: Updated default queries in examples for more relevant results.

### Documentation
- **README Enhancements**: Added badges, platform logos, and a visual overview image to the README.
- **License**: Added MIT License to the project.

## [0.1.2] - 2026-01-08

### Changed
- **Cleaner Logs**: Removed verbose `console.log` statements from `KalshiExchange` and `PolymarketExchange` to ensure a quieter library experience.
- **Improved Error Handling**: Switched noisy data parsing warnings to silent failures or internal handling.
- **Repository Restructuring**: Flattened project structure for easier development and publishing.
- **readme.md**: Pushed readme.md to npmjs.org

### Removed
- `Fetched n pages from Kalshi...` logs.
- `Extracted n markets from k events.` logs.
- `Failed to parse outcomes` warnings in Polymarket.