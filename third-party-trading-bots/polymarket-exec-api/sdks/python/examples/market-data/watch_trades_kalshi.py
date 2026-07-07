import pmxt
import os
import sys
from datetime import datetime

def run():
    # 1. Check for credentials first
    api_key = os.getenv('KALSHI_API_KEY')
    private_key = os.getenv('KALSHI_PRIVATE_KEY')

    if not api_key or not private_key:
        print("Error: KALSHI_API_KEY and KALSHI_PRIVATE_KEY environment variables must be set.")
        sys.exit(1)

    # 2. Initialize the client
    api = pmxt.Kalshi(
        api_key=api_key,
        private_key=private_key
    )
    
    ticker = "KXSERIEAGAME-26JAN25JUVNAP-JUV"
    title = "Juventus vs Napoli (Juventus Win)"

    print(f"Watching trades for: {title}")
    print(f"Ticker: {ticker}\n")

    try:
        while True:
            # Method name is watch_trades
            trades = api.watch_trades(ticker)
            for trade in trades:
                side_str = trade.side.upper().rjust(4)
                amount_str = f"{trade.amount:10,.0f}"
                price_str = f"${trade.price:.3f}"
                time_str = datetime.fromtimestamp(trade.timestamp / 1000).strftime('%H:%M:%S')
                
                print(f"[TRADE] {side_str} | {amount_str} contracts @ {price_str} | {time_str}")
                
    except KeyboardInterrupt:
        print("\nStopping...")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    run()
