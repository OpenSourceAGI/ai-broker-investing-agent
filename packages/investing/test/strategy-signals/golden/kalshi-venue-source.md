# PyKalshi mapping fixture provenance

The raw fixture follows vendored `pykalshi/models.py:MarketModel`. Independent hand-reviewed YES quotes are 52/55 cents; NO quotes are 40/43 cents, deliberately not complements. The SDK assessment imports the actual Python model and serializes those quote values without credentials. A 3-contract YES BUY at 55 cents leaves 9,835 cents and 3 YES contracts from 10,000 cents. Missing quotes stay null.

`market-dollars.json` carries the same quotes in Kalshi's 2026 fixed-point form. The Market schema at https://docs.kalshi.com/api-reference/market/get-market types `yes_bid_dollars`, `yes_ask_dollars`, `no_bid_dollars` and `no_ask_dollars` as `FixedPointDollars` strings (example `"0.5600"`, up to 6 decimals) and no longer lists the integer-cent fields; https://docs.kalshi.com/getting_started/subpenny_pricing describes the format. Expected cents are the same hand-reviewed 52/55 and 40/43, so the dollar fixture must map to exactly the legacy result.
