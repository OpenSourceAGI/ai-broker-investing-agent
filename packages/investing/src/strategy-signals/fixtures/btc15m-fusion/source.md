# BTC weighted-fusion fixture provenance

Independent implementation; the vendored MIT badge has no matching copyright notice or license text. No code was translated.

Behavior reference: `Polymarket-BTC-15-Minute-Trading-Bot/core/strategy_brain/fusion_engine/signal_fusion.py` at commit `b877b41`, blob `a0ea422f6a3c900f014551e9af45d4d46658b899`. Default processor weights are 0.4, 0.3, 0.2 and 0.1. Contribution is weight × confidence × strength/4. A tie chooses bullish. Actionability requires consensus score ≥ 60 and average confidence ≥ 0.6. The direction is not an independent forecast probability.

Hand-reviewed golden: all three fixture confidences are 0.8 and strengths 4. Bullish contributions are 0.4 × 0.8 + 0.2 × 0.8 = 0.48; bearish is 0.3 × 0.8 = 0.24. Consensus is 0.48 / 0.72 × 100 = 66⅔, average confidence 0.8. At 50¢, $1 buys floor(100/50) = two YES contracts. The bearish fixture reverses each direction, producing two NO contracts.

Corrections/policies: time is supplied explicitly as `evaluationTime`, future signals are rejected, and the upstream's strict less-than-five-minute comparison is preserved: exactly five minutes is stale. Unknown directions are rejected rather than substring-matched or ignored. Observations must be ordered, with no duplicate processor timestamps; separate processors may share a timestamp. $1 position, $10 aggregate cost exposure and five open positions are entry-only guards; daily loss and drawdown are not ported because the account snapshot has no required history. These omissions are explicit, not silently assumed to be enforced.

Native assessment on Python 3.14: the declared dependency file cannot install on Linux due to `pywin32==311`; the actual `bot.py --test-mode` attempt then fails for missing `nautilus_trader`. The README's `run_bot.py` does not exist. Exact evidence is in local `devdocs/third-party-integration/local/bot-runs/btc15m-fusion/run.md`.
