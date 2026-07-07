# WebSocket Streaming Examples for Probable

**Note:** The `@prob/clob` SDK has compatibility issues with `tsx`. WebSocket streaming examples must be run with **native Node.js** after building the project.

## Option 1: Using Built Code (Recommended)

First, build the project:
```bash
npm run build
```

Then run the examples:
```bash
node examples/api-reference/streaming/watchOrderBook.mjs
node examples/api-reference/streaming/close.mjs
```

## Option 2: Direct SDK Usage

You can also use the SDK directly without pmxt:

```javascript
import { createClobClient } from '@prob/clob';

const client = createClobClient({
    baseUrl: 'https://api.probable.markets/public/api/v1',
    wsUrl: 'wss://ws.probable.markets/public/api/v1',
    chainId: 56,
});

const tokenId = 'your-token-id-here';

const sub = client.subscribePublicStream(
    [`book:${tokenId}`],
    (data) => {
        console.log('Order book update:', {
            bids: data.bids?.length,
            asks: data.asks?.length,
            bestBid: data.bids?.[0],
            bestAsk: data.asks?.[0],
        });
    }
);

// Cleanup
// sub.unsubscribe();
```

## Known Issues

- `tsx` cannot properly handle the `@prob/clob` SDK's module resolution
- Error: `Mt.default.create is not a function`
- Workaround: Use native Node.js with ESM (`.mjs` files) or built CommonJS code
