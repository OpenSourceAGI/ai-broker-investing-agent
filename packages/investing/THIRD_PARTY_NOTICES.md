# Third-party notices

Vendored reference commit: `b877b41`. Paths below are relative to `third-party-trading-bots/`. Runtime code does not import those projects. These notices are included in the published package through its `files` list.

## PyKalshi momentum and market mapping

Existing momentum core and strategy-signals momentum/market adapters.

- `kalshi-bot-api/examples/momentum_bot.py` — git blob `1cb14aa8719543a2a6b6bdb75f8e694125353191`.
- `kalshi-bot-api/pykalshi/models.py` — git blob `67db90124f6dde4e08f0194a10811a3f3562fb99`.
- `kalshi-bot-api/LICENSE` — git blob `c13f99117e366fd54b4c097b67ca34dfb1fb8ba1`.

```text
MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Kalshi Vibe forecast math and guards

Translated Kelly/sizing and entry-gate math in strategy-signals/sources/kalshi-vibe*.ts.

- `Kalshi-Vibe-Bot/backend/src/decision_engine/strategy_math.py` — git blob `e02a3251a7ee6f63097eba77f4b6a2060cdee58e`.
- `Kalshi-Vibe-Bot/backend/src/decision_engine/strategy_gates.py` — git blob `191d0af680d92b3293cf96873692309f8e2bbec4`.
- `Kalshi-Vibe-Bot/LICENSE` — git blob `c61ca81ca0f2dc1120f2d4b96bc43f4ea19619b0`.

```text
MIT License

Copyright (c) 2026 K-Jeez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## pmxt market model mapping

Public market-model adapter in strategy-signals/venues/pmxt-venue-mapping.ts; no SDK runtime imported.

- `polymarket-exec-api/core/src/types.ts` — git blob `e291f5161d39332791b13bea7ee371cc96eb9f93`.
- `polymarket-exec-api/LICENSE` — git blob `ebdb1ded0878ebcb1820eece701c3561ab15ab17`.

```text
MIT License

Copyright (c) 2026 pmxt.dev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Prediction Markets Trading Bot Toolkits sizing

Translated copy-trade sizing in prediction-markets/strategies/copy-trade-sizing.ts and its source adapter.

- `Prediction-Markets-Trading-Bot-Toolkits/src/service/strategy.rs` — git blob `2d6cd20831c2bbeed88634255b707802681dc589`.
- `Prediction-Markets-Trading-Bot-Toolkits/LICENSE` — git blob `ba609116a40941e8b9d2b177a823c1cd4687d5a0`.

```text
MIT License

Copyright (c) 2025 HarrierOnChain

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Independently implemented contributions

The following implementations use observed behavior or public input/output contracts as references. No vendored source code was translated into them because the vendored notice evidence was incomplete. Reference hashes identify the behavior reviewed; they do not establish a license grant.

| Contribution | Reference at b877b41 | Reference blob | Notice evidence / approach |
|---|---|---|---|
| Gabagool sequential portfolio targets | `poly-bot-gabagool/src/order-builder/copytrade.ts` | `012cc0183270f8887c94842e436aa002c76da43f` | ISC metadata, no complete notice; independent strategy and adapter |
| BTC fusion | `Polymarket-BTC-15-Minute-Trading-Bot/core/strategy_brain/fusion_engine/signal_fusion.py` | `a0ea422f6a3c900f014551e9af45d4d46658b899` | MIT badge without holder/notice; independent fusion and guards |
| Hedge-fund technicals | `ai-hedge-fund/src/agents/technicals.py` | `8bcdbd9edd042bc4902ef973cc67c334e0842720` | No matching backend notice; independent mathematical implementation, pinned against original Python reference outputs |
| Red flags | `debate-agents/red_flag_detector.py` | `b4d95312305ceffe1802a7f41a9ed7600f291df6` | No license evidence; independent typed advisory rules |
| Survival posture | `poly-bot-openclaw/core/survival/SurvivalManager.js` | `16ecbf7a2d87c67e2d12313b9413eb1dd166e746` | ISC metadata without complete notice; independent state transitions; numeric size multipliers are new demo policy |
| OpenBB historical bars | `fin-data-api-python/app/provider/standard_models/equity_historical.py` | `c7f6d433559711365a555a71e33ff00991cb0fa4` | No matching complete notice; independent public data-contract mapping |

Upstream full applications, providers, schedulers, wallets and services are not bundled through these integrations. The package's own license declaration remains as defined in package.json.
