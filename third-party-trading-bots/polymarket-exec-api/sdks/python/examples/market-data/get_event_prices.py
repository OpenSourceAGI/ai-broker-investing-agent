import pmxt

def main():
    api = pmxt.Polymarket()
    markets = api.fetch_markets(slug='who-will-trump-nominate-as-fed-chair')
    
    # Python alternative to markets.find
    warsh = next((m for m in markets if m.outcomes[0].label == 'Kevin Warsh'), None)

    if warsh:
        print(warsh.outcomes[0].price)
    else:
        print("Market not found")

if __name__ == "__main__":
    main()
