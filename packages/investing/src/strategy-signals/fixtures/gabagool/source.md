# Gabagool fixture provenance

This is an independent implementation. The vendored package supplies only ISC metadata, with no complete copyright notice. No code was translated.

Behavior references at commit `b877b41`: `src/config/index.ts:78` sets entry threshold $0.499; `src/order-builder/copytrade.ts:1057–1063` sets the next-leg ceiling from the actual other-side average; `:1309–1338` uses actual fills. The copytrade blob is `012cc0183270f8887c94842e436aa002c76da43f`.

Hand-reviewed golden arithmetic: initial cash 10,000¢; five YES at 49¢ cost 245¢ → 9,755¢. The other-side ceiling is 98 − 49 = 49¢, so NO at 52¢ waits. A NO quote of 48¢ costs 240¢ for five contracts → 9,515¢. Both five-contract targets are then satisfied. The second-leg rejection case changes the venue quote to 50¢ after approval at 48¢; no fill changes the first-leg holdings or cash. A cap of two first-leg contracts spends 98¢, and the following leg uses those two actual YES fills, not a fictitious quantity of five.

The independent demo policy builds a fixed five-contract target, chooses the less-filled side first, then the cheaper side (YES on a tie). It does not reproduce the upstream's reversal timers, repeated-buy counters, order-book depth, allowances or redemption workers. Confidence 1 describes deterministic rule satisfaction and is not a probability forecast.

Native assessment: declared dependency install and safe config import succeed under Bun 1.3.11; there is no paper or demo entrypoint. The live credential/allowance entrypoint was not invoked. Exact evidence is in local `devdocs/third-party-integration/local/bot-runs/gabagool/run.md`.
