import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { createHash } from 'crypto';
import { UnifiedMarket, MarketOutcome } from '../../types';
import { addBinaryOutcomes } from '../../utils/market-utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PROGRAM_ID = new PublicKey('FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ');

// Anchor account discriminators (first 8 bytes of sha256("account:{AccountName}"))
export const MARKET_DISCRIMINATOR = Buffer.from([219, 190, 213, 55, 0, 227, 198, 154]);
export const RACE_MARKET_DISCRIMINATOR = Buffer.from([235, 196, 111, 75, 230, 113, 118, 238]);
export const USER_POSITION_DISCRIMINATOR = Buffer.from([251, 248, 209, 245, 83, 234, 17, 27]);
export const RACE_POSITION_DISCRIMINATOR = Buffer.from([44, 182, 16, 1, 230, 14, 174, 46]);

export const MARKET_DISCRIMINATOR_BS58 = bs58.encode(MARKET_DISCRIMINATOR);
export const RACE_MARKET_DISCRIMINATOR_BS58 = bs58.encode(RACE_MARKET_DISCRIMINATOR);
export const USER_POSITION_DISCRIMINATOR_BS58 = bs58.encode(USER_POSITION_DISCRIMINATOR);
export const RACE_POSITION_DISCRIMINATOR_BS58 = bs58.encode(RACE_POSITION_DISCRIMINATOR);

export const LAMPORTS_PER_SOL = 1_000_000_000;

// Market status enum indices
export const MarketStatus = {
    Active: 0,
    Closed: 1,
    Resolved: 2,
    Cancelled: 3,
    Paused: 4,
    ResolvedPending: 5,
    Disputed: 6,
} as const;

export const STATUS_NAMES: Record<number, string> = {
    0: 'active',
    1: 'closed',
    2: 'resolved',
    3: 'cancelled',
    4: 'paused',
    5: 'resolved_pending',
    6: 'disputed',
};

// ---------------------------------------------------------------------------
// Borsh Buffer Reader
// ---------------------------------------------------------------------------

export class BorshReader {
    private buf: Buffer;
    private offset: number;

    constructor(buf: Buffer | Uint8Array) {
        this.buf = Buffer.from(buf);
        this.offset = 0;
    }

    readU8(): number {
        const v = this.buf.readUInt8(this.offset);
        this.offset += 1;
        return v;
    }

    readU16(): number {
        const v = this.buf.readUInt16LE(this.offset);
        this.offset += 2;
        return v;
    }

    readU64(): bigint {
        const v = this.buf.readBigUInt64LE(this.offset);
        this.offset += 8;
        return v;
    }

    readI64(): bigint {
        const v = this.buf.readBigInt64LE(this.offset);
        this.offset += 8;
        return v;
    }

    readBool(): boolean {
        return this.readU8() === 1;
    }

    readPubkey(): string {
        const bytes = this.buf.subarray(this.offset, this.offset + 32);
        this.offset += 32;
        return bs58.encode(bytes);
    }

    readString(): string {
        const len = this.buf.readUInt32LE(this.offset);
        this.offset += 4;
        const str = this.buf.subarray(this.offset, this.offset + len).toString('utf8');
        this.offset += len;
        return str;
    }

    readOptionBool(): boolean | null {
        const hasValue = this.readU8();
        if (hasValue === 0) return null;
        return this.readBool();
    }

    readOptionU8(): number | null {
        const hasValue = this.readU8();
        if (hasValue === 0) return null;
        return this.readU8();
    }

    readOptionPubkey(): string | null {
        const hasValue = this.readU8();
        if (hasValue === 0) return null;
        return this.readPubkey();
    }

    readFixedBytes(len: number): Buffer {
        const bytes = this.buf.subarray(this.offset, this.offset + len);
        this.offset += len;
        return Buffer.from(bytes);
    }

    skip(len: number): void {
        this.offset += len;
    }

    readOptionFixedBytes(len: number): Buffer | null {
        const hasValue = this.readU8();
        if (hasValue === 0) return null;
        return this.readFixedBytes(len);
    }

    getOffset(): number {
        return this.offset;
    }
}

// ---------------------------------------------------------------------------
// Parsed Account Types
// ---------------------------------------------------------------------------

export interface BaoziMarket {
    marketId: bigint;
    question: string;
    closingTime: bigint;
    resolutionTime: bigint;
    yesPool: bigint;
    noPool: bigint;
    status: number;
    winningOutcome: boolean | null;
    layer: number;
    creator: string;
    creatorFeeBps: number;
    platformFeeBpsAtCreation: number;
    hasBets: boolean;
    lastBetTime: bigint;
}

export interface BaoziRaceMarket {
    marketId: bigint;
    question: string;
    closingTime: bigint;
    resolutionTime: bigint;
    outcomeCount: number;
    outcomeLabels: string[];
    outcomePools: bigint[];
    totalPool: bigint;
    status: number;
    winningOutcome: number | null;
    layer: number;
    creator: string;
    creatorFeeBps: number;
    platformFeeBpsAtCreation: number;
    lastBetTime: bigint;
}

export interface BaoziUserPosition {
    user: string;
    marketId: bigint;
    yesAmount: bigint;
    noAmount: bigint;
    claimed: boolean;
}

export interface BaoziRacePosition {
    user: string;
    marketId: bigint;
    bets: bigint[];
    totalBet: bigint;
    claimed: boolean;
}

// ---------------------------------------------------------------------------
// Account Parsers
// ---------------------------------------------------------------------------

export function parseMarket(data: Buffer | Uint8Array): BaoziMarket {
    const reader = new BorshReader(data);

    // Skip 8-byte discriminator
    reader.skip(8);

    const marketId = reader.readU64();
    const question = reader.readString();
    const closingTime = reader.readI64();
    const resolutionTime = reader.readI64();
    reader.readI64(); // auto_stop_buffer
    const yesPool = reader.readU64();
    const noPool = reader.readU64();
    reader.readU64(); // snapshot_yes_pool
    reader.readU64(); // snapshot_no_pool
    const status = reader.readU8();
    const winningOutcome = reader.readOptionBool();
    reader.readU8(); // currency_type
    reader.skip(33); // _reserved_usdc_vault
    reader.readU64(); // creator_bond
    reader.readU64(); // total_claimed
    reader.readU64(); // platform_fee_collected
    const lastBetTime = reader.readI64();
    reader.readU8(); // bump
    const layer = reader.readU8();
    reader.readU8(); // resolution_mode
    reader.readU8(); // access_gate
    const creator = reader.readPubkey();
    reader.readOptionPubkey(); // oracle_host
    reader.skip(160); // council [pubkey; 5]
    reader.skip(4); // council_size, council_votes_yes, council_votes_no, council_threshold
    reader.readU64(); // total_affiliate_fees
    reader.readOptionFixedBytes(32); // invite_hash
    const creatorFeeBps = reader.readU16();
    reader.readU64(); // total_creator_fees
    reader.readOptionPubkey(); // creator_profile
    const platformFeeBpsAtCreation = reader.readU16();
    reader.readU16(); // affiliate_fee_bps_at_creation
    reader.readI64(); // betting_freeze_seconds_at_creation
    const hasBets = reader.readBool();

    return {
        marketId,
        question,
        closingTime,
        resolutionTime,
        yesPool,
        noPool,
        status,
        winningOutcome,
        layer,
        creator,
        creatorFeeBps,
        platformFeeBpsAtCreation,
        hasBets,
        lastBetTime,
    };
}

export function parseRaceMarket(data: Buffer | Uint8Array): BaoziRaceMarket {
    const reader = new BorshReader(data);

    // Skip 8-byte discriminator
    reader.skip(8);

    const marketId = reader.readU64();
    const question = reader.readString();
    const closingTime = reader.readI64();
    const resolutionTime = reader.readI64();
    reader.readI64(); // auto_stop_buffer
    const outcomeCount = reader.readU8();

    // outcome_labels: [[u8; 32]; 10]
    const outcomeLabels: string[] = [];
    for (let i = 0; i < 10; i++) {
        const labelBytes = reader.readFixedBytes(32);
        if (i < outcomeCount) {
            // Trim trailing zero bytes and decode as UTF-8
            const nonZero = Array.from(labelBytes).filter(b => b !== 0);
            outcomeLabels.push(Buffer.from(nonZero).toString('utf8'));
        }
    }

    // outcome_pools: [u64; 10]
    const outcomePools: bigint[] = [];
    for (let i = 0; i < 10; i++) {
        outcomePools.push(reader.readU64());
    }

    const totalPool = reader.readU64();

    // snapshot_pools: [u64; 10]
    reader.skip(80); // 10 * 8 bytes
    reader.readU64(); // snapshot_total

    const status = reader.readU8();
    const winningOutcome = reader.readOptionU8();
    reader.readU8(); // currency_type
    reader.readU64(); // platform_fee_collected
    reader.readU64(); // creator_fee_collected
    reader.readU64(); // total_claimed
    const lastBetTime = reader.readI64();
    reader.readU8(); // bump
    const layer = reader.readU8();
    reader.readU8(); // resolution_mode
    reader.readU8(); // access_gate
    const creator = reader.readPubkey();
    reader.readOptionPubkey(); // oracle_host
    reader.skip(160); // council [pubkey; 5]
    reader.readU8(); // council_size
    reader.skip(10); // council_votes [u8; 10]
    reader.readU8(); // council_threshold
    const creatorFeeBps = reader.readU16();
    reader.readOptionPubkey(); // creator_profile
    const platformFeeBpsAtCreation = reader.readU16();

    return {
        marketId,
        question,
        closingTime,
        resolutionTime,
        outcomeCount,
        outcomeLabels: outcomeLabels.slice(0, outcomeCount),
        outcomePools: outcomePools.slice(0, outcomeCount),
        totalPool,
        status,
        winningOutcome,
        layer,
        creator,
        creatorFeeBps,
        platformFeeBpsAtCreation,
        lastBetTime,
    };
}

export function parseUserPosition(data: Buffer | Uint8Array): BaoziUserPosition {
    const reader = new BorshReader(data);
    reader.skip(8); // discriminator

    const user = reader.readPubkey();
    const marketId = reader.readU64();
    const yesAmount = reader.readU64();
    const noAmount = reader.readU64();
    const claimed = reader.readBool();

    return { user, marketId, yesAmount, noAmount, claimed };
}

export function parseRacePosition(data: Buffer | Uint8Array): BaoziRacePosition {
    const reader = new BorshReader(data);
    reader.skip(8); // discriminator

    const user = reader.readPubkey();
    const marketId = reader.readU64();

    const bets: bigint[] = [];
    for (let i = 0; i < 10; i++) {
        bets.push(reader.readU64());
    }

    const totalBet = reader.readU64();
    const claimed = reader.readBool();

    return { user, marketId, bets, totalBet, claimed };
}

// ---------------------------------------------------------------------------
// Mapping to Unified Types
// ---------------------------------------------------------------------------

export function mapBooleanToUnified(market: BaoziMarket, pubkey: string): UnifiedMarket {
    const totalPool = market.yesPool + market.noPool;
    const totalPoolSol = Number(totalPool) / LAMPORTS_PER_SOL;

    // Implied probability from pool ratios (inverse — more bets on YES = higher NO implied price)
    // In pari-mutuel: your payout if YES wins = totalPool / yesPool
    // So the implied probability of YES = noPool / totalPool (complement side)
    // This matches the standard: price reflects how much you'd pay per unit of payout
    let yesPrice = 0.5;
    let noPrice = 0.5;
    if (totalPool > 0n) {
        yesPrice = Number(market.noPool) / Number(totalPool);
        noPrice = Number(market.yesPool) / Number(totalPool);
    }

    const outcomes: MarketOutcome[] = [
        {
            outcomeId: `${pubkey}-YES`,
            marketId: pubkey,
            label: 'Yes',
            price: yesPrice,
        },
        {
            outcomeId: `${pubkey}-NO`,
            marketId: pubkey,
            label: 'No',
            price: noPrice,
        },
    ];

    const um: UnifiedMarket = {
        marketId: pubkey,
        title: market.question,
        description: '',
        outcomes,
        resolutionDate: new Date(Number(market.resolutionTime) * 1000),
        volume24h: 0, // Not available without indexer
        volume: totalPoolSol,
        liquidity: totalPoolSol,
        url: `https://baozi.bet/market/${pubkey}`,
        category: layerName(market.layer),
        tags: [layerName(market.layer), 'solana', 'pari-mutuel'],
    };

    addBinaryOutcomes(um);
    return um;
}

export function mapRaceToUnified(market: BaoziRaceMarket, pubkey: string): UnifiedMarket {
    const totalPoolSol = Number(market.totalPool) / LAMPORTS_PER_SOL;

    const outcomes: MarketOutcome[] = [];
    for (let i = 0; i < market.outcomeCount; i++) {
        const pool = market.outcomePools[i];
        // Implied probability: complement side pool / total pool
        const otherPools = market.totalPool - pool;
        const price = market.totalPool > 0n
            ? Number(otherPools) / (Number(market.totalPool) * (market.outcomeCount - 1))
            : 1 / market.outcomeCount;

        outcomes.push({
            outcomeId: `${pubkey}-${i}`,
            marketId: pubkey,
            label: market.outcomeLabels[i] || `Outcome ${i + 1}`,
            price: Math.min(Math.max(price, 0), 1),
        });
    }

    // Normalize prices to sum to 1
    const priceSum = outcomes.reduce((s, o) => s + o.price, 0);
    if (priceSum > 0) {
        for (const o of outcomes) {
            o.price = o.price / priceSum;
        }
    }

    const um: UnifiedMarket = {
        marketId: pubkey,
        title: market.question,
        description: '',
        outcomes,
        resolutionDate: new Date(Number(market.resolutionTime) * 1000),
        volume24h: 0,
        volume: totalPoolSol,
        liquidity: totalPoolSol,
        url: `https://baozi.bet/market/${pubkey}`,
        category: layerName(market.layer),
        tags: [layerName(market.layer), 'solana', 'pari-mutuel', 'race'],
    };

    // For 2-outcome races, add binary convenience getters
    addBinaryOutcomes(um);
    return um;
}

// ---------------------------------------------------------------------------
// PDA Derivation
// ---------------------------------------------------------------------------

export function deriveConfigPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        PROGRAM_ID,
    );
    return pda;
}

export function deriveMarketPda(marketId: bigint): PublicKey {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(marketId);
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('market'), buf],
        PROGRAM_ID,
    );
    return pda;
}

export function derivePositionPda(marketId: bigint, user: PublicKey): PublicKey {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(marketId);
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('position'), buf, user.toBuffer()],
        PROGRAM_ID,
    );
    return pda;
}

export function deriveRaceMarketPda(marketId: bigint): PublicKey {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(marketId);
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('race'), buf],
        PROGRAM_ID,
    );
    return pda;
}

export function deriveRacePositionPda(marketId: bigint, user: PublicKey): PublicKey {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(marketId);
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('race_position'), buf, user.toBuffer()],
        PROGRAM_ID,
    );
    return pda;
}

// ---------------------------------------------------------------------------
// Instruction Discriminators
// ---------------------------------------------------------------------------

export function getInstructionDiscriminator(name: string): Buffer {
    return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

export const PLACE_BET_SOL_DISCRIMINATOR = getInstructionDiscriminator('place_bet_sol');
export const BET_ON_RACE_OUTCOME_SOL_DISCRIMINATOR = getInstructionDiscriminator('bet_on_race_outcome_sol');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function layerName(layer: number): string {
    switch (layer) {
        case 0: return 'official';
        case 1: return 'lab';
        case 2: return 'private';
        default: return 'unknown';
    }
}

/** Simple TTL cache */
export class Cache<T> {
    private data: T | null = null;
    private timestamp = 0;
    private ttlMs: number;

    constructor(ttlMs: number) {
        this.ttlMs = ttlMs;
    }

    get(): T | null {
        if (this.data && Date.now() - this.timestamp < this.ttlMs) {
            return this.data;
        }
        return null;
    }

    set(value: T): void {
        this.data = value;
        this.timestamp = Date.now();
    }

    clear(): void {
        this.data = null;
        this.timestamp = 0;
    }
}
