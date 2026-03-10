import { createClobClient } from '@prob/clob';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import { ExchangeCredentials } from '../../BaseExchange';

/**
 * Manages Probable authentication and CLOB client initialization.
 * Requires a privateKey and pre-generated API key triplet (apiKey, apiSecret, passphrase).
 */
export class ProbableAuth {
    private credentials: ExchangeCredentials;
    private clobClient?: ReturnType<typeof createClobClient>;
    private walletAddress: string;

    constructor(credentials: ExchangeCredentials) {
        this.credentials = credentials;

        if (!credentials.privateKey) {
            throw new Error('Probable requires a privateKey for authentication');
        }

        if (!credentials.apiKey || !credentials.apiSecret || !credentials.passphrase) {
            throw new Error(
                'Probable requires pre-generated API credentials (apiKey, apiSecret, passphrase). ' +
                'Generate them at https://probable.markets or via the SDK.'
            );
        }

        const account = privateKeyToAccount(credentials.privateKey as `0x${string}`);
        this.walletAddress = account.address;
    }

    getClobClient(): ReturnType<typeof createClobClient> {
        if (this.clobClient) {
            return this.clobClient;
        }

        const chainId = parseInt(process.env.PROBABLE_CHAIN_ID || '56', 10);
        const chain = chainId === 97 ? bscTestnet : bsc;

        const account = privateKeyToAccount(this.credentials.privateKey as `0x${string}`);
        const wallet = createWalletClient({
            account,
            chain,
            transport: http(),
        });

        const credential = {
            key: this.credentials.apiKey!,
            secret: this.credentials.apiSecret!,
            passphrase: this.credentials.passphrase!,
        };

        if (chainId === 56) {
            this.clobClient = createClobClient({
                chainId: 56,
                wallet,
                credential,
            });
        } else {
            const baseUrl = process.env.PROBABLE_BASE_URL || 'https://api.probable.markets/public/api/v1';
            this.clobClient = createClobClient({
                chainId,
                baseUrl,
                wallet,
                credential,
            });
        }

        return this.clobClient;
    }

    getAddress(): string {
        return this.walletAddress;
    }
}
