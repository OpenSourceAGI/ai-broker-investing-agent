import pmxt

def main():
    poly = pmxt.Polymarket()
    kalshi = pmxt.Kalshi()

    print('Polymarket:', poly.fetch_markets(query='Trump'))
    print('Kalshi:', kalshi.fetch_markets(query='Trump'))

if __name__ == "__main__":
    main()
