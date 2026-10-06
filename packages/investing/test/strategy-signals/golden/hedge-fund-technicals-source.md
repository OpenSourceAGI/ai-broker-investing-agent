# Hedge-fund technical reference provenance

Vendored reference commit: `b877b41`. Technicals blob: `8bcdbd9edd042bc4902ef973cc67c334e0842720`.

The expected JSON was produced by running original Python function definitions extracted with AST from the credential-excluded staged source. The runner is `test/strategy-signals/golden/hedge-fund-technicals-reference.py`. It never calls the TypeScript implementation. Dependencies: pandas 2.3.3, numpy 1.26.4, Python 3.11. Container image `python:3.11-slim`, digest `sha256:6f31d6e9ba2b0a787a3f81c37b004155b87b9efa1b771182bd550c1615745be5`. The assessment runs offline through `harness/assess.sh`; raw evidence is in local `bot-runs/hedge-fund-technicals/`.

The five cases cover increasing, decreasing, flat, short and oscillating prices. Every group, confidence, metric and numeric helper is compared with independently generated expected values. Non-finite helpers/confidences are JSON null, while upstream `safe_float` metrics are zero. The synthetic OHLCV formula and inputs are embedded in the runner/JSON.

Observed upstream quirk: Hurst subtracts pandas Series slices that retain their original indices. Pandas aligns by index, making overlap differences zero. Empty overlaps are epsilon-clamped by Python `max(epsilon, NaN)`. All fixtures produce an effectively zero fitted slope, including the short series. This implementation preserves the observed result; it does not substitute an array-based estimator. Sample Bollinger/volatility variance uses ddof=1, RSI uses simple rolling means including the initial zero, trend EMA uses adjust=False, ADX EMA uses adjust=True.

The original full backtester was also attempted after the successful reference run. It failed at interactive model selection in the noninteractive offline container (EOFError); this is not a successful full hedge-fund backtest. The deterministic component reference succeeds. There is no complete license notice for the vendored technicals revision, so the TypeScript implementation is independently written from the behavioral contract and mathematical definitions, with no translated code.
