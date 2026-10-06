# Vibe reference provenance

`kalshi-vibe-kelly.json` contains hand-reviewed values from upstream `strategy_math.py` and `strategy_gates.py`, not values generated from the TypeScript source. Full Kelly is `(p-price)/(1-price)` and whole-contract sizing is `floor(fraction*cash/price)`. A 5% premium cap applies when it funds one contract; otherwise the affordable full Kelly applies, including the positive-edge one-contract retry.

For 10,000 cents, p=.70, price=.55: full Kelly = 1/3, 60 whole contracts before cap, `floor(500/55)=9` after cap. The NO case uses P(YES)=.30 and the same buy-side probability .70. For 1,000 cents, p=.60 and price=.55, the 50-cent cap cannot fund a contract, so full Kelly gives 2 contracts. For 55 cents, Kelly floors to zero but cash funds the one-contract retry. At 54 cents, it does not. The 1,200-cent/.58/56-cent case is independently pinned by upstream `tests/test_strategy_math.py:test_single_contract_retry_when_kelly_rounds_to_zero_but_edge`; it exercises sizing alone, below the default 60%/5-point entry minima.

The Docker assessment runs upstream `scripts/simulate_filters.py` on a synthetic staged SQLite fixture and upstream math/gate unit tests. See local assessment `devdocs/third-party-integration/local/bot-runs/kalshi-vibe/run.md`; this synthetic assessment is not a live-market calibration claim.

Source fixtures `fixtures/kalshi-vibe/{yes,no}.json` are invented recorded forecasts and independent quotes. Their expected paper BUY is 9 contracts at 55 cents, leaving 9,505 cents from an initial 10,000. These are demonstrations, not real model estimates.
