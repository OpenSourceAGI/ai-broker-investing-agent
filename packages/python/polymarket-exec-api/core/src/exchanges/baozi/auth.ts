import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { ExchangeCredentials } from '../../BaseExchange';

/**
 * Manages Solana wallet authentication for Baozi.
 * Read operations don't need auth (all on-chain data is public).
 * Write operations (betting, claiming) require a Solana keypair.
 */
export class BaoziAuth {
    private keypair: Keypair;

    constructor(credentials: ExchangeCredentials) {
        if (!credentials.privateKey) {
            throw new Error('Baozi requires a privateKey (base58-encoded Solana secret key) for trading operations');
        }

        this.keypair = Keypair.fromSecretKey(bs58.decode(credentials.privateKey));
    }

    getPublicKey(): PublicKey {
        return this.keypair.publicKey;
    }

    getKeypair(): Keypair {
        return this.keypair;
    }

    signTransaction(tx: Transaction): Transaction {
        tx.sign(this.keypair);
        return tx;
    }
}
