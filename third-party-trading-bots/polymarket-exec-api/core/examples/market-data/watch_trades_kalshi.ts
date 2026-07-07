import pmxt from '../../src';

async function run() {
    const ticker = "KXSERIEAGAME-26JAN25JUVNAP-JUV";
    const title = "Juventus vs Napoli (Juventus Win)";

    console.log(`Watching trades for: ${title}`);
    console.log(`Ticker: ${ticker}\n`);

    const api = new pmxt.Kalshi({
        credentials: {
            apiKey: process.env.KALSHI_API_KEY,
            privateKey: process.env.KALSHI_PRIVATE_KEY
        }
    });

    try {
        while (true) {
            const trades = await api.watchTrades(ticker);
            for (const trade of trades) {
                console.log(`[TRADE] ${trade.side.toUpperCase().padStart(4)} | ${trade.amount.toLocaleString().padStart(10)} contracts @ $${trade.price.toFixed(3)} | ${new Date(trade.timestamp).toLocaleTimeString()}`);
            }
        }
    } catch (error: any) {
        console.error('Error:', error.message);
    } finally {
        await api.close();
    }
}

run().catch(console.error);
