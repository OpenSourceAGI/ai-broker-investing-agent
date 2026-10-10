# Momentum reference

Hand-reviewed from `kalshi-bot-api/examples/momentum_bot.py` and the already merged port at commit `b877b41`. Five prices 50, 51, 52, 53, 55 produce four upward movements. The final tick satisfies three consecutive increases, enters 10 YES contracts, and uses the current 55-cent quote. This expectation does not replay an assumed earlier fill. The expected cash after BUY then SELL at 60 is 10050 cents from a 10000-cent account.
