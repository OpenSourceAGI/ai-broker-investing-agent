# Connect momentum paper replays to the strategy approval pipeline

The existing momentum paper replay bypasses the shared strategy approval workflow. This follow-up connects actionable replay intents to the pipeline introduced in #200 without replacing its graph, risk stages, FundManager, or other bot adapters.

- Normalize momentum research and portfolio snapshots into existing strategy-signal context, then require proposal-bound FundManager APPROVE before execution.
- Preserve the original BUY/SELL action, YES/NO outcome, quantity, price and timestamp. MODIFY or resized approvals become HOLD for this replay.
- Validate history, market identity, chronology and resumed inventory; reconcile strategy positions only from actual fills.
- Emit the declared prediction-market/trading-agent ESM and CommonJS entries, retain MIT attribution, and provide a recorded credential-free demo.

Verification:

- Targeted compatibility tests: 126 passed.
- Full investing suite on Windows: 425 passed, 13 skipped; two failures also present on unmodified main (CRLF prompt fixtures and URL.pathname handling).
- Package build, strict changed-core check, recorded demo, built ESM/CommonJS execution and license check passed.
- TypeScript comparisons: package 86 upstream / 86 current; test project 77 upstream / 77 current; no new diagnostics. Package-wide typing is not clean.
- No investing lint script is configured. Docker validation was unavailable because the local Linux engine was not running.

Paper execution assumes immediate fills at complementary recorded prices, without fees, spread, slippage, settlement or resolution. Model responses are recorded fixtures; no live trades or hosted-provider performance is claimed.
