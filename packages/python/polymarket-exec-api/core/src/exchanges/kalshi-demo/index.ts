import { ExchangeCredentials } from "../../BaseExchange";
import { KalshiExchange, KalshiWebSocketConfig } from "../kalshi";

export interface KalshiDemoExchangeOptions {
    credentials?: ExchangeCredentials;
    websocket?: KalshiWebSocketConfig;
}

export class KalshiDemoExchange extends KalshiExchange {
    constructor(options?: ExchangeCredentials | KalshiDemoExchangeOptions) {
        // Normalise: accept either plain credentials or the options-object form,
        // then force demoMode: true.
        if (options && "credentials" in options) {
            super({ ...options, demoMode: true } as any);
        } else {
            super({
                credentials: options as ExchangeCredentials | undefined,
                demoMode: true,
            } as any);
        }
    }

    override get name(): string {
        return "KalshiDemo";
    }
}
