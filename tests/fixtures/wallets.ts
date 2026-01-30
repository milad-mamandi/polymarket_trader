import type { Wallet, WalletInsert } from '../../src/models/wallet.js';
import type { DetectedWallet } from '../../src/services/walletScanner.js';
import { mockTimestamp } from '../setup.js';

/**
 * Test fixtures for wallet-related data
 */

// Mock wallet addresses
export const WHALE_ADDRESS = '0x1234567890123456789012345678901234567890';
export const NEW_SUSPICIOUS_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
export const NORMAL_ADDRESS = '0x9999999999999999999999999999999999999999';
export const OLD_WALLET_ADDRESS = '0x1111111111111111111111111111111111111111';

// Mock wallet created timestamps
const OLD_WALLET_DATE = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year ago
const NEW_WALLET_DATE = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
const WEEK_OLD_WALLET_DATE = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 1 week ago

/**
 * Complete wallet database records
 */
export const mockWallets: Record<string, Wallet> = {
  whale: {
    address: WHALE_ADDRESS,
    first_seen: OLD_WALLET_DATE,
    wallet_created_at: OLD_WALLET_DATE,
    is_whale: true,
    is_new_suspicious: false,
    total_volume: 500000,
    win_count: 15,
    loss_count: 5,
    suspicion_score: 0.2,
    last_updated: mockTimestamp,
  },
  newSuspicious: {
    address: NEW_SUSPICIOUS_ADDRESS,
    first_seen: NEW_WALLET_DATE,
    wallet_created_at: NEW_WALLET_DATE,
    is_whale: false,
    is_new_suspicious: true,
    total_volume: 25000,
    win_count: 3,
    loss_count: 0,
    suspicion_score: 0.85,
    last_updated: mockTimestamp,
  },
  normal: {
    address: NORMAL_ADDRESS,
    first_seen: WEEK_OLD_WALLET_DATE,
    wallet_created_at: WEEK_OLD_WALLET_DATE,
    is_whale: false,
    is_new_suspicious: false,
    total_volume: 5000,
    win_count: 8,
    loss_count: 7,
    suspicion_score: 0.1,
    last_updated: mockTimestamp,
  },
  old: {
    address: OLD_WALLET_ADDRESS,
    first_seen: OLD_WALLET_DATE,
    wallet_created_at: OLD_WALLET_DATE,
    is_whale: false,
    is_new_suspicious: false,
    total_volume: 50000,
    win_count: 25,
    loss_count: 20,
    suspicion_score: 0.05,
    last_updated: mockTimestamp,
  },
};

/**
 * Wallet insert fixtures (for upsert operations)
 */
export const mockWalletInserts: Record<string, WalletInsert> = {
  whale: {
    address: WHALE_ADDRESS,
    wallet_created_at: OLD_WALLET_DATE,
    is_whale: true,
    is_new_suspicious: false,
    total_volume: 500000,
    suspicion_score: 0.2,
  },
  newSuspicious: {
    address: NEW_SUSPICIOUS_ADDRESS,
    wallet_created_at: NEW_WALLET_DATE,
    is_whale: false,
    is_new_suspicious: true,
    total_volume: 25000,
    suspicion_score: 0.85,
  },
  normal: {
    address: NORMAL_ADDRESS,
    wallet_created_at: WEEK_OLD_WALLET_DATE,
    is_whale: false,
    is_new_suspicious: false,
    total_volume: 5000,
    suspicion_score: 0.1,
  },
};

/**
 * Detected wallet fixtures (from scanner)
 */
export const mockDetectedWallets: Record<string, Omit<DetectedWallet, 'trade'>> = {
  whale: {
    address: WHALE_ADDRESS,
    isWhale: true,
    isNewSuspicious: false,
    walletAge: 8760, // 365 days in hours
    createdAt: OLD_WALLET_DATE,
  },
  newSuspicious: {
    address: NEW_SUSPICIOUS_ADDRESS,
    isWhale: false,
    isNewSuspicious: true,
    walletAge: 2, // 2 hours
    createdAt: NEW_WALLET_DATE,
  },
  normal: {
    address: NORMAL_ADDRESS,
    isWhale: false,
    isNewSuspicious: false,
    walletAge: 168, // 7 days in hours
    createdAt: WEEK_OLD_WALLET_DATE,
  },
};

/**
 * Helper to create a wallet insert with custom properties
 */
export function createWalletInsert(overrides: Partial<WalletInsert> = {}): WalletInsert {
  return {
    address: NORMAL_ADDRESS,
    wallet_created_at: WEEK_OLD_WALLET_DATE,
    is_whale: false,
    is_new_suspicious: false,
    total_volume: 5000,
    suspicion_score: 0.1,
    ...overrides,
  };
}

/**
 * Helper to create a detected wallet with custom properties
 */
export function createDetectedWallet(
  overrides: Partial<DetectedWallet> = {}
): Omit<DetectedWallet, 'trade'> {
  return {
    address: NORMAL_ADDRESS,
    isWhale: false,
    isNewSuspicious: false,
    walletAge: 168,
    createdAt: WEEK_OLD_WALLET_DATE,
    ...overrides,
  };
}
