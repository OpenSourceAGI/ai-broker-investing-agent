# Real PMXT Demo - MarketList.match()

## Files

- **`demo-real-usage.py`** - Real demo using actual PMXT data (requires running server)
- **`demo-usage.py`** - Mock demo using sample data (no dependencies)

## Running the Real Demo

### Prerequisites

1. Ensure PMXT server is running:
```bash
pmxt-server
```

Or auto-start it in your code (the SDK does this automatically if `pmxt-core` is installed).

### Run the Demo

```bash
cd /Users/samueltinnerholm/Documents/GitHub/pmxt/sdks/python
python demo-real-usage.py
```

### What It Does

1. Connects to Polymarket
2. Fetches ~100 markets
3. Filters for Oscars 2026 / Best Picture markets
4. Wraps them in `MarketList` 
5. Uses `market_list.match('One Battle')` to find a specific market
6. Demonstrates array operations (indexing, filtering, etc.)

### Expected Output

```
=== Real PMXT MarketList.match() Demo ===

Fetching markets from Polymarket...
Fetched X markets

--- Filtering for Oscars 2026 markets ---

Found Y relevant markets

Sample markets:
  1. Oscars 2026: Best Picture Winner - Dune Part Two
  2. Oscars 2026: Best Picture Winner - One Battle
  3. ...

--- Using market_list.match('One Battle') ---

✓ Found: Oscars 2026: Best Picture Winner - One Battle
  Market ID: 0x456
  Volume 24h: $30,000
  Liquidity: $15,000
  ...
```

## Running the Mock Demo

If the server isn't available, you can run the mock demo which uses sample data:

```bash
python demo-usage.py
```

This doesn't require any running services and demonstrates the exact same functionality.
