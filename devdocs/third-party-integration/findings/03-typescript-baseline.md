# TypeScript baseline

`bunx tsc --noEmit -p tsconfig.json` in `packages/investing`, at upstream commit `b877b41`, before any change for this work. The command exits 2 with **86 diagnostics in 20 files**. None of them come from this work.

## How to compare after a change

`bun run build` exits 0 even with these errors, so a green build proves nothing about types (see [02](02-build-packaging-and-tooling.md)). A later type check passes only if it adds **no new diagnostic identity or occurrence**:

1. Normalize each diagnostic to `(file, TS code, message)`, and drop the line and column. Line numbers move when code is edited.
2. Count the occurrences of each identity.
3. Every identity whose count is higher than below is a failure. That includes identities that do not appear below at all.
4. A lower count is an improvement. It is reported, but it is never required.

Do not compare raw totals. A fixed error can hide a new one, and the total stays the same.

The script `../harness/tsc-diff.sh` (created in plan Phase 0) does this comparison against the list below.

## Diagnostics by file

| File (relative to `packages/investing/`) | Count |
|---|---|
| `src/alpaca/alpaca-mcp-client.ts` | 7 |
| `src/debate-research/stock-agents-api.ts` | 2 |
| `src/index.ts` | 5 |
| `src/leaders/zulu.ts` | 2 |
| `src/prediction/api/analytics.ts` | 5 |
| `src/prediction/api/markets.ts` | 7 |
| `src/prediction/api/prices.ts` | 1 |
| `src/prediction/sync/holders.ts` | 7 |
| `src/prediction/sync/incremental-markets.ts` | 7 |
| `src/prediction/sync/prices.ts` | 2 |
| `src/stocks/import-stock-names.ts` | 7 |
| `src/stocks/index.ts` | 1 |
| `src/stocks/quote-cache-service.ts` | 1 |
| `src/stocks/sec-filing-api.ts` | 1 |
| `src/stocks/unified-quote-service.ts` | 2 |
| `src/stocks/yahoo-finance-wrapper.ts` | 1 |
| `src/trading-agents/tools/alpaca-mcp-tools.ts` | 4 |
| `src/trading-agents/tools/data-tools.ts` | 7 |
| `src/trading-agents/tools/langchain-tools.ts` | 10 |
| `src/trading-agents/utils/llm-client.ts` | 7 |

## Full diagnostic list

```text
src/alpaca/alpaca-mcp-client.ts(111,23): error TS18046: 'error' is of type 'unknown'.
src/alpaca/alpaca-mcp-client.ts(115,10): error TS18046: 'result' is of type 'unknown'.
src/alpaca/alpaca-mcp-client.ts(116,23): error TS18046: 'result' is of type 'unknown'.
src/alpaca/alpaca-mcp-client.ts(119,12): error TS18046: 'result' is of type 'unknown'.
src/alpaca/alpaca-mcp-client.ts(347,18): error TS18046: 'data' is of type 'unknown'.
src/alpaca/alpaca-mcp-client.ts(348,29): error TS18046: 'data' is of type 'unknown'.
src/alpaca/alpaca-mcp-client.ts(349,22): error TS18046: 'data' is of type 'unknown'.
src/debate-research/stock-agents-api.ts(133,23): error TS18046: 'error' is of type 'unknown'.
src/debate-research/stock-agents-api.ts(136,5): error TS2322: Type 'unknown' is not assignable to type 'T'.
  'T' could be instantiated with an arbitrary type which could be unrelated to 'unknown'.
src/index.ts(26,1): error TS2308: Module "./correlate/predict-statistics" has already exported a member named 'PredictOptions'. Consider explicitly re-exporting to resolve the ambiguity.
src/index.ts(26,1): error TS2308: Module "./correlate/predict-statistics" has already exported a member named 'TrainTestSplit'. Consider explicitly re-exporting to resolve the ambiguity.
src/index.ts(26,1): error TS2308: Module "./correlate/predict-statistics" has already exported a member named 'XGBoostParams'. Consider explicitly re-exporting to resolve the ambiguity.
src/index.ts(26,1): error TS2308: Module "./trading-agents" has already exported a member named 'NewsItem'. Consider explicitly re-exporting to resolve the ambiguity.
src/index.ts(45,1): error TS2308: Module "./stocks" has already exported a member named 'getQuote'. Consider explicitly re-exporting to resolve the ambiguity.
src/leaders/zulu.ts(25,10): error TS18046: 'data' is of type 'unknown'.
src/leaders/zulu.ts(285,57): error TS18046: 'd' is of type 'unknown'.
src/prediction/api/analytics.ts(45,7): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/api/analytics.ts(72,5): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/api/analytics.ts(95,5): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/api/analytics.ts(122,7): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/api/analytics.ts(148,7): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/api/markets.ts(29,7): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/api/markets.ts(72,33): error TS2339: Property 'length' does not exist on type '{}'.
src/prediction/api/markets.ts(77,28): error TS2488: Type '{}' must have a '[Symbol.iterator]()' method that returns an iterator.
src/prediction/api/markets.ts(78,27): error TS2339: Property 'length' does not exist on type '{}'.
src/prediction/api/markets.ts(84,19): error TS2339: Property 'length' does not exist on type '{}'.
src/prediction/api/markets.ts(138,19): error TS18046: 'searchResults' is of type 'unknown'.
src/prediction/api/markets.ts(224,5): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/api/prices.ts(50,5): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/sync/holders.ts(17,26): error TS2339: Property 'events' does not exist on type '{}'.
src/prediction/sync/holders.ts(17,43): error TS2339: Property 'events' does not exist on type '{}'.
src/prediction/sync/holders.ts(18,30): error TS2339: Property 'events' does not exist on type '{}'.
src/prediction/sync/holders.ts(32,32): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/holders.ts(32,67): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/holders.ts(33,45): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/holders.ts(34,35): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/incremental-markets.ts(113,40): error TS2339: Property 'events' does not exist on type '{}'.
src/prediction/sync/incremental-markets.ts(113,58): error TS2339: Property 'events' does not exist on type '{}'.
src/prediction/sync/incremental-markets.ts(114,37): error TS2339: Property 'events' does not exist on type '{}'.
src/prediction/sync/incremental-markets.ts(126,42): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/incremental-markets.ts(126,77): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/incremental-markets.ts(127,56): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/incremental-markets.ts(128,43): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/prices.ts(40,35): error TS2345: Argument of type 'unknown' is not assignable to parameter of type '{ history: { t: number; p: number; }[]; }'.
src/prediction/sync/prices.ts(42,23): error TS18046: 'priceHistory' is of type 'unknown'.
src/stocks/import-stock-names.ts(177,13): error TS18046: 'data' is of type 'unknown'.
src/stocks/import-stock-names.ts(177,40): error TS18046: 'data' is of type 'unknown'.
src/stocks/import-stock-names.ts(178,13): error TS18046: 'data' is of type 'unknown'.
src/stocks/import-stock-names.ts(190,54): error TS18046: 'data' is of type 'unknown'.
src/stocks/import-stock-names.ts(280,35): error TS2339: Property 'data' does not exist on type '{}'.
src/stocks/import-stock-names.ts(280,50): error TS2339: Property 'data' does not exist on type '{}'.
src/stocks/import-stock-names.ts(281,41): error TS2339: Property 'data' does not exist on type '{}'.
src/stocks/index.ts(13,1): error TS2308: Module './types' has already exported a member named 'HistoricalDataResponse'. Consider explicitly re-exporting to resolve the ambiguity.
src/stocks/quote-cache-service.ts(181,30): error TS2358: The left-hand side of an 'instanceof' expression must be of type 'any', an object type or a type parameter.
src/stocks/sec-filing-api.ts(11,5): error TS2305: Module '"./types"' has no exported member 'FilingOptions'.
src/stocks/unified-quote-service.ts(109,35): error TS2740: Type 'CachedQuote' is missing the following properties from type 'NormalizedQuote': marketCap, currency, name, exchange, and 2 more.
src/stocks/unified-quote-service.ts(242,31): error TS2345: Argument of type 'CachedQuote' is not assignable to parameter of type 'NormalizedQuote'.
  Type 'CachedQuote' is missing the following properties from type 'NormalizedQuote': marketCap, currency, name, exchange, and 2 more.
src/stocks/yahoo-finance-wrapper.ts(163,48): error TS2339: Property 'quotes' does not exist on type '{}'.
src/trading-agents/tools/alpaca-mcp-tools.ts(27,21): error TS18046: 'error' is of type 'unknown'.
src/trading-agents/tools/alpaca-mcp-tools.ts(31,8): error TS18046: 'result' is of type 'unknown'.
src/trading-agents/tools/alpaca-mcp-tools.ts(32,21): error TS18046: 'result' is of type 'unknown'.
src/trading-agents/tools/alpaca-mcp-tools.ts(35,10): error TS18046: 'result' is of type 'unknown'.
src/trading-agents/tools/data-tools.ts(36,21): error TS2339: Property 'quotes' does not exist on type 'never'.
src/trading-agents/tools/data-tools.ts(126,18): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/tools/data-tools.ts(127,16): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/tools/data-tools.ts(128,22): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/tools/data-tools.ts(129,12): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/tools/data-tools.ts(130,16): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/tools/data-tools.ts(131,21): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/tools/langchain-tools.ts(216,12): error TS18046: 'result' is of type 'unknown'.
src/trading-agents/tools/langchain-tools.ts(217,25): error TS18046: 'result' is of type 'unknown'.
src/trading-agents/tools/langchain-tools.ts(221,17): error TS18046: 'result' is of type 'unknown'.
src/trading-agents/tools/langchain-tools.ts(222,15): error TS18046: 'result' is of type 'unknown'.
src/trading-agents/tools/langchain-tools.ts(223,25): error TS18046: 'result' is of type 'unknown'.
src/trading-agents/tools/langchain-tools.ts(224,25): error TS18046: 'result' is of type 'unknown'.
src/trading-agents/tools/langchain-tools.ts(225,25): error TS18046: 'result' is of type 'unknown'.
src/trading-agents/tools/langchain-tools.ts(226,26): error TS18046: 'result' is of type 'unknown'.
src/trading-agents/tools/langchain-tools.ts(227,21): error TS18046: 'result' is of type 'unknown'.
src/trading-agents/tools/langchain-tools.ts(228,20): error TS18046: 'result' is of type 'unknown'.
src/trading-agents/utils/llm-client.ts(89,16): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/utils/llm-client.ts(90,18): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/utils/llm-client.ts(123,16): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/utils/llm-client.ts(124,18): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/utils/llm-client.ts(166,16): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/utils/llm-client.ts(216,16): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/utils/llm-client.ts(217,18): error TS18046: 'data' is of type 'unknown'.
```

## Existing test and example diagnostics (Docker reference)

The original source-only list above remains unchanged. The new `tsconfig.test.json` checks every `test/**/*.ts` and `examples/**/*.ts`, with ambient source declarations included. The same configuration was run in offline Docker against files extracted from untouched commit `b877b41`, exiting 2 with 77 diagnostics. This includes 12 additional pre-existing test/example occurrences outside the source reference, and omits some source-only files.

The gate chooses the exact baseline for each configuration: 86 for source, 77 for test/examples. It does not use their union, because a larger source count could otherwise hide a new test-scope occurrence in an imported source file. The complete untouched test/example reference follows; line/column are discarded for comparison.

```text
examples/qwksearch-demo.ts(10,22): error TS7016: Could not find a declaration file for module '../src/qwksearch/api-client'. '/repo/packages/investing/src/qwksearch/api-client.js' implicitly has an 'any' type.
src/alpaca/alpaca-mcp-client.ts(111,23): error TS18046: 'error' is of type 'unknown'.
src/alpaca/alpaca-mcp-client.ts(115,10): error TS18046: 'result' is of type 'unknown'.
src/alpaca/alpaca-mcp-client.ts(116,23): error TS18046: 'result' is of type 'unknown'.
src/alpaca/alpaca-mcp-client.ts(119,12): error TS18046: 'result' is of type 'unknown'.
src/alpaca/alpaca-mcp-client.ts(347,18): error TS18046: 'data' is of type 'unknown'.
src/alpaca/alpaca-mcp-client.ts(348,29): error TS18046: 'data' is of type 'unknown'.
src/alpaca/alpaca-mcp-client.ts(349,22): error TS18046: 'data' is of type 'unknown'.
src/debate-research/stock-agents-api.ts(133,23): error TS18046: 'error' is of type 'unknown'.
src/debate-research/stock-agents-api.ts(136,5): error TS2322: Type 'unknown' is not assignable to type 'T'.
src/index.ts(26,1): error TS2308: Module "./correlate/predict-statistics" has already exported a member named 'PredictOptions'. Consider explicitly re-exporting to resolve the ambiguity.
src/index.ts(26,1): error TS2308: Module "./correlate/predict-statistics" has already exported a member named 'TrainTestSplit'. Consider explicitly re-exporting to resolve the ambiguity.
src/index.ts(26,1): error TS2308: Module "./correlate/predict-statistics" has already exported a member named 'XGBoostParams'. Consider explicitly re-exporting to resolve the ambiguity.
src/index.ts(26,1): error TS2308: Module "./trading-agents" has already exported a member named 'NewsItem'. Consider explicitly re-exporting to resolve the ambiguity.
src/index.ts(45,1): error TS2308: Module "./stocks" has already exported a member named 'getQuote'. Consider explicitly re-exporting to resolve the ambiguity.
src/leaders/zulu.ts(25,10): error TS18046: 'data' is of type 'unknown'.
src/leaders/zulu.ts(285,57): error TS18046: 'd' is of type 'unknown'.
src/prediction/api/analytics.ts(45,7): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/api/analytics.ts(72,5): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/api/analytics.ts(95,5): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/api/analytics.ts(122,7): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/api/analytics.ts(148,7): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/api/markets.ts(29,7): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/api/markets.ts(72,33): error TS2339: Property 'length' does not exist on type '{}'.
src/prediction/api/markets.ts(77,28): error TS2488: Type '{}' must have a '[Symbol.iterator]()' method that returns an iterator.
src/prediction/api/markets.ts(78,27): error TS2339: Property 'length' does not exist on type '{}'.
src/prediction/api/markets.ts(84,19): error TS2339: Property 'length' does not exist on type '{}'.
src/prediction/api/markets.ts(138,19): error TS18046: 'searchResults' is of type 'unknown'.
src/prediction/api/markets.ts(224,5): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/api/prices.ts(50,5): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type 'RequestInit'.
src/prediction/sync/holders.ts(17,26): error TS2339: Property 'events' does not exist on type '{}'.
src/prediction/sync/holders.ts(17,43): error TS2339: Property 'events' does not exist on type '{}'.
src/prediction/sync/holders.ts(18,30): error TS2339: Property 'events' does not exist on type '{}'.
src/prediction/sync/holders.ts(32,32): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/holders.ts(32,67): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/holders.ts(33,45): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/holders.ts(34,35): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/incremental-markets.ts(113,40): error TS2339: Property 'events' does not exist on type '{}'.
src/prediction/sync/incremental-markets.ts(113,58): error TS2339: Property 'events' does not exist on type '{}'.
src/prediction/sync/incremental-markets.ts(114,37): error TS2339: Property 'events' does not exist on type '{}'.
src/prediction/sync/incremental-markets.ts(126,42): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/incremental-markets.ts(126,77): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/incremental-markets.ts(127,56): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/incremental-markets.ts(128,43): error TS2339: Property 'holders' does not exist on type '{}'.
src/prediction/sync/prices.ts(40,35): error TS2345: Argument of type 'unknown' is not assignable to parameter of type '{ history: { t: number; p: number; }[]; }'.
src/prediction/sync/prices.ts(42,23): error TS18046: 'priceHistory' is of type 'unknown'.
src/stocks/index.ts(13,1): error TS2308: Module './types' has already exported a member named 'HistoricalDataResponse'. Consider explicitly re-exporting to resolve the ambiguity.
src/stocks/quote-cache-service.ts(181,30): error TS2358: The left-hand side of an 'instanceof' expression must be of type 'any', an object type or a type parameter.
src/stocks/sec-filing-api.ts(11,5): error TS2305: Module '"./types"' has no exported member 'FilingOptions'.
src/stocks/unified-quote-service.ts(109,35): error TS2740: Type 'CachedQuote' is missing the following properties from type 'NormalizedQuote': marketCap, currency, name, exchange, and 2 more.
src/stocks/unified-quote-service.ts(242,31): error TS2345: Argument of type 'CachedQuote' is not assignable to parameter of type 'NormalizedQuote'.
src/stocks/yahoo-finance-wrapper.ts(163,48): error TS2339: Property 'quotes' does not exist on type '{}'.
src/trading-agents/tools/data-tools.ts(36,21): error TS2339: Property 'quotes' does not exist on type 'never'.
src/trading-agents/tools/data-tools.ts(126,18): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/tools/data-tools.ts(127,16): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/tools/data-tools.ts(128,22): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/tools/data-tools.ts(129,12): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/tools/data-tools.ts(130,16): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/tools/data-tools.ts(131,21): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/utils/llm-client.ts(89,16): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/utils/llm-client.ts(90,18): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/utils/llm-client.ts(123,16): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/utils/llm-client.ts(124,18): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/utils/llm-client.ts(166,16): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/utils/llm-client.ts(216,16): error TS18046: 'data' is of type 'unknown'.
src/trading-agents/utils/llm-client.ts(217,18): error TS18046: 'data' is of type 'unknown'.
test/arbitrage.test.ts(187,39): error TS2339: Property 'markets' does not exist on type '{}'.
test/arbitrage.test.ts(274,23): error TS2339: Property 'markets' does not exist on type '{}'.
test/polymarket-price-history.test.ts(25,12): error TS18046: 'markets' is of type 'unknown'.
test/polymarket-price-history.test.ts(27,20): error TS18046: 'markets' is of type 'unknown'.
test/polymarket-price-history.test.ts(48,12): error TS18046: 'result' is of type 'unknown'.
test/polymarket-price-history.test.ts(49,26): error TS18046: 'result' is of type 'unknown'.
test/polymarket-price-history.test.ts(50,12): error TS18046: 'result' is of type 'unknown'.
test/polymarket-price-history.test.ts(53,24): error TS18046: 'result' is of type 'unknown'.
test/polymarket-price-history.test.ts(59,50): error TS18046: 'result' is of type 'unknown'.
test/polymarket-price-history.test.ts(61,32): error TS18046: 'result' is of type 'unknown'.
test/polymarket-price-history.test.ts(61,47): error TS18046: 'result' is of type 'unknown'.
```
