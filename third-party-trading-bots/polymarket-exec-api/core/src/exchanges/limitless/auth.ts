import { HttpClient } from '@limitless-exchange/sdk';
import { Wallet } from 'ethers';
import { ExchangeCredentials } from '../../BaseExchange';

const LIMITLESS_HOST = 'https://api.limitless.exchange';

/**
 * Manages Limitless authentication using API keys.
 * Simplified from cookie-based to API key authentication.
 */
export class LimitlessAuth {
    private credentials: ExchangeCredentials;
    private signer?: Wallet;
    private httpClient?: HttpClient;
    private apiKey?: string;

    constructor(credentials: ExchangeCredentials) {
        this.credentials = credentials;

        // API key is required for authenticated endpoints
        // Can come from credentials or environment variable
        this.apiKey = credentials.apiKey || process.env.LIMITLESS_API_KEY;

        if (!this.apiKey) {
            throw new Error(
                'Limitless requires an API key. Set LIMITLESS_API_KEY environment variable or provide apiKey in credentials.'
            );
        }

        // Initialize signer if private key is provided (needed for order signing)
        if (credentials.privateKey) {
            let privateKey = credentials.privateKey;
            // Fix for common .env issue where newlines are escaped
            if (privateKey.includes('\\n')) {
                privateKey = privateKey.replace(/\\n/g, '\n');
            }
            this.signer = new Wallet(privateKey);
        }
    }

    /**
     * Get the API key being used for authentication.
     */
    getApiKey(): string {
        return this.apiKey!;
    }

    /**
     * Get or create the HTTP client with API key authentication.
     * This client automatically includes the X-API-Key header in all requests.
     */
    getHttpClient(): HttpClient {
        if (this.httpClient) {
            return this.httpClient;
        }

        this.httpClient = new HttpClient({
            baseURL: LIMITLESS_HOST,
            apiKey: this.apiKey,
            timeout: 30000,
        });

        return this.httpClient;
    }

    /**
     * Get the signer (wallet) for signing orders.
     * Required for placing orders via EIP-712 signatures.
     */
    getSigner(): Wallet {
        if (!this.signer) {
            throw new Error(
                'Wallet signer not available. Provide privateKey in credentials to sign orders.'
            );
        }
        return this.signer;
    }

    /**
     * Get the signer's address.
     */
    getAddress(): string {
        if (!this.signer) {
            throw new Error('Signer not initialized. Provide privateKey in credentials.');
        }
        return this.signer.address;
    }

    /**
     * Check if the auth has a signer available.
     */
    hasSigner(): boolean {
        return !!this.signer;
    }

    /**
     * Reset cached client (useful for testing or credential rotation).
     */
    reset(): void {
        this.httpClient = undefined;
    }
}
