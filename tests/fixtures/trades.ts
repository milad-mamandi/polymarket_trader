import type { Trade } from '../../src/services/polymarket/types.js';
import type { WalletTrade } from '../../src/models/trade.js';
import { WHALE_ADDRESS, NEW_SUSPICIOUS_ADDRESS, NORMAL_ADDRESS } from './wallets.js';
import { MARKET_IDS, MARKET_TITLES } from './markets.js';
import { mockTimestamp, generateMockId } from '../setup.js';

/**
 * Test fixtures for trade-related data
 */

// Mock transaction hashes
export const TX_HASH_1 = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
export const TX_HASH_2 = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
export const TX_HASH_3 = '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba';

/**
 * Polymarket API Trade responses
 */
export const mockApiTrades: Record<string, Trade> = {
  whaleBuy: {
    id: MARKET_IDS.trump,
    proxyWallet: WHALE_ADDRESS,
    side: 'BUY',
    asset: '0xasset123',
    conditionId: MARKET_IDS.trump,
    size: 80000, // 80k shares @ $0.65 = $52k trade
    price: 0.65,
    timestamp: Date.now() - 3600000, // 1 hour ago
    title: MARKET_TITLES.trump,
    slug: 'will-trump-win-2024',
    icon: 'https://example.com/trump.png',
    eventSlug: 'politics-2024',
    outcome: 'Yes',
    outcomeIndex: 0,
    name: 'Whale Trader',
    pseudonym: 'BigSpender',
    bio: 'Professional trader',
    profileImage: 'https://example.com/profile1.jpg',
    profileImageOptimized: 'https://example.com/profile1_opt.jpg',
    transactionHash: TX_HASH_1,
  },
  newSuspiciousBuy: {
    id: MARKET_IDS.bitcoin,
    proxyWallet: NEW_SUSPICIOUS_ADDRESS,
    side: 'BUY',
    asset: '0xasset456',
    conditionId: MARKET_IDS.bitcoin,
    size: 70000, // 70k shares @ $0.72 = $50.4k trade from 2-hour-old wallet
    price: 0.72,
    timestamp: Date.now() - 1800000, // 30 minutes ago
    title: MARKET_TITLES.bitcoin,
    slug: 'bitcoin-100k-2024',
    icon: 'https://example.com/btc.png',
    eventSlug: 'crypto-2024',
    outcome: 'Yes',
    outcomeIndex: 0,
    name: 'New Trader',
    pseudonym: 'CryptoFan',
    bio: '',
    profileImage: '',
    profileImageOptimized: '',
    transactionHash: TX_HASH_2,
  },
  normalBuy: {
    id: MARKET_IDS.ai,
    proxyWallet: NORMAL_ADDRESS,
    side: 'BUY',
    asset: '0xasset789',
    conditionId: MARKET_IDS.ai,
    size: 2000, // $2k trade (below whale threshold)
    price: 0.55,
    timestamp: Date.now() - 7200000, // 2 hours ago
    title: MARKET_TITLES.ai,
    slug: 'ai-agi-2025',
    icon: 'https://example.com/ai.png',
    eventSlug: 'tech-2025',
    outcome: 'No',
    outcomeIndex: 1,
    name: 'Regular User',
    pseudonym: 'TechEnthusiast',
    bio: 'Just trading for fun',
    profileImage: 'https://example.com/profile3.jpg',
    profileImageOptimized: 'https://example.com/profile3_opt.jpg',
    transactionHash: TX_HASH_3,
  },
  sellTrade: {
    id: MARKET_IDS.trump,
    proxyWallet: WHALE_ADDRESS,
    side: 'SELL',
    asset: '0xasset123',
    conditionId: MARKET_IDS.trump,
    size: 75000, // 75k shares @ $0.68 = $51k trade
    price: 0.68,
    timestamp: Date.now() - 300000, // 5 minutes ago
    title: MARKET_TITLES.trump,
    slug: 'will-trump-win-2024',
    icon: 'https://example.com/trump.png',
    eventSlug: 'politics-2024',
    outcome: 'Yes',
    outcomeIndex: 0,
    name: 'Whale Trader',
    pseudonym: 'BigSpender',
    bio: 'Professional trader',
    profileImage: 'https://example.com/profile1.jpg',
    profileImageOptimized: 'https://example.com/profile1_opt.jpg',
    transactionHash: '0xsell123',
  },
};

/**
 * Database wallet trade records
 */
export const mockWalletTrades: Record<string, WalletTrade> = {
  whaleTradeUnresolved: {
    id: generateMockId(),
    wallet_address: WHALE_ADDRESS,
    market_id: MARKET_IDS.trump,
    market_title: MARKET_TITLES.trump,
    outcome: 'Yes',
    side: 'BUY',
    size: 80000,
    price: 0.65,
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    resolved: false,
  },
  suspiciousTradeUnresolved: {
    id: generateMockId(),
    wallet_address: NEW_SUSPICIOUS_ADDRESS,
    market_id: MARKET_IDS.bitcoin,
    market_title: MARKET_TITLES.bitcoin,
    outcome: 'Yes',
    side: 'BUY',
    size: 70000,
    price: 0.72,
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    resolved: false,
  },
  normalTradeUnresolved: {
    id: generateMockId(),
    wallet_address: NORMAL_ADDRESS,
    market_id: MARKET_IDS.ai,
    market_title: MARKET_TITLES.ai,
    outcome: 'No',
    side: 'BUY',
    size: 2000,
    price: 0.55,
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    resolved: false,
  },
  whaleTradeWon: {
    id: generateMockId(),
    wallet_address: WHALE_ADDRESS,
    market_id: MARKET_IDS.trump,
    market_title: MARKET_TITLES.trump,
    outcome: 'Yes',
    side: 'BUY',
    size: 100000,
    price: 0.60,
    timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    resolved: true,
    won: true,
  },
  whaleTradeLost: {
    id: generateMockId(),
    wallet_address: WHALE_ADDRESS,
    market_id: MARKET_IDS.bitcoin,
    market_title: MARKET_TITLES.bitcoin,
    outcome: 'No',
    side: 'BUY',
    size: 75000,
    price: 0.45,
    timestamp: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
    resolved: true,
    won: false,
  },
};

/**
 * Helper to create an API trade with custom properties
 */
export function createApiTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: MARKET_IDS.trump,
    proxyWallet: NORMAL_ADDRESS,
    side: 'BUY',
    asset: '0xasset123',
    conditionId: MARKET_IDS.trump,
    size: 5000,
    price: 0.50,
    timestamp: Date.now(),
    title: MARKET_TITLES.trump,
    slug: 'test-market',
    icon: 'https://example.com/icon.png',
    eventSlug: 'test-event',
    outcome: 'Yes',
    outcomeIndex: 0,
    name: 'Test User',
    pseudonym: 'Tester',
    bio: '',
    profileImage: '',
    profileImageOptimized: '',
    transactionHash: generateMockId(),
    ...overrides,
  };
}

/**
 * Helper to create a wallet trade with custom properties
 */
export function createWalletTrade(
  overrides: Partial<WalletTrade> = {}
): Omit<WalletTrade, 'timestamp' | 'resolved'> {
  return {
    id: generateMockId(),
    wallet_address: NORMAL_ADDRESS,
    market_id: MARKET_IDS.trump,
    market_title: MARKET_TITLES.trump,
    outcome: 'Yes',
    side: 'BUY',
    size: 5000,
    price: 0.50,
    ...overrides,
  };
}

/**
 * Array of large trades (for whale scanner)
 */
export const largeTrades: Trade[] = [
  mockApiTrades.whaleBuy,
  mockApiTrades.newSuspiciousBuy,
];

/**
 * Array of small trades (below whale threshold)
 */
export const smallTrades: Trade[] = [mockApiTrades.normalBuy];
