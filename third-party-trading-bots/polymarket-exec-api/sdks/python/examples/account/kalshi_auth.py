import os
import pmxt

def main():
    client = pmxt.Kalshi(
        api_key=os.getenv("KALSHI_API_KEY"),
        private_key=os.getenv("KALSHI_PRIVATE_KEY")
    )
    print("Kalshi client initialized")

if __name__ == "__main__":
    main()
