# Copy-sizing golden provenance

The sizing function is ported from `Prediction-Markets-Trading-Bot-Toolkits/src/service/strategy.rs` at commit `b877b41`, blob `2d6cd20831c2bbeed88634255b707802681dc589`. Its MIT notice is Copyright (c) 2025 HarrierOnChain; license blob `ba609116a40941e8b9d2b177a823c1cd4687d5a0`. The full notice ships in `THIRD_PARTY_NOTICES.md`.

The original five Rust tests ran successfully offline in `rust:1.90` during the assessment: percentage_basic, fixed_uses_copy_size, caps_at_max, skips_tiny_whale, adaptive_decays_with_size. The test configuration sets 20%/fixed $20, 1× multiplier, $5 minimum, $500 maximum, ten minimum whale shares, $1,000 adaptive threshold and 5%–30% adaptive bounds. Local run evidence: `devdocs/third-party-integration/local/bot-runs/copy-trade-sizing/run.md` and `run.log`.

The same assessment additionally attempted the native copy-trading CLI with the vendored public config's `enable_trading: false`, `mock_trading: true`, and an explicit missing credentials path. Its Polygon websocket requires network even in mock mode; offline DNS failures led to the 40-second inner timeout. The bot assessment outcome is `needs-network`, separate from the successful five reference tests.

The golden pins those independently specified test values: 20% × $100 = $20; fixed $20; 100% × $10,000 capped at $500; one observed whale share is skipped. The adaptive weight is 1/(1 + notional/threshold), giving 5 + 25/1.1 = 27.727272727272727% at $100, and 5 + 25/11 = 7.272727272727273% at $10,000. These exact adaptive numbers are hand-reviewed arithmetic, strengthening the Rust test's ordering assertions.

Whole-contract conversion is new integration policy: floor(copyUsd × 100 / priceCents). At 50¢, $20 is 40 contracts and $500 is 1,000. Below one contract gives no order. Upstream's default test configuration is the adapter's documented demo default; this adapter ports sizing only, not its websocket ingestion, eligibility, position monitor or signed execution.
