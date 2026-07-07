import { ExchangeCredentials } from '../../BaseExchange';

export class MyriadAuth {
    private credentials: ExchangeCredentials;

    constructor(credentials: ExchangeCredentials) {
        this.credentials = credentials;
        this.validateCredentials();
    }

    private validateCredentials() {
        if (!this.credentials.apiKey) {
            throw new Error('Myriad requires an apiKey for authentication');
        }
    }

    getHeaders(): Record<string, string> {
        return {
            'x-api-key': this.credentials.apiKey!,
            'Content-Type': 'application/json',
        };
    }

    get walletAddress(): string | undefined {
        return this.credentials.privateKey;
    }
}
