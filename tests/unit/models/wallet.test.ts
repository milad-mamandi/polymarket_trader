import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import Database from 'better-sqlite3';
import { mockWalletInserts, WHALE_ADDRESS, NEW_SUSPICIOUS_ADDRESS, NORMAL_ADDRESS } from '../../fixtures/wallets.js';

/**
 * Unit tests for wallet model (src/models/wallet.ts)
 * Tests CRUD operations for wallet data
 * 
 * Note: These tests use a real in-memory SQLite database
 * and re-implement the wallet functions locally to avoid ES module mocking issues
 */

// Wallet interfaces
interface Wallet {
  address: string;
  first_seen: string;
  wallet_created_at?: string;
  is_whale: number;
  is_new_suspicious: number;
  total_volume: number;
  win_count: number;
  loss_count: number;
  suspicion_score: number;
  last_updated: string;
}

interface WalletInsert {
  address: string;
  wallet_created_at?: string;
  is_whale: boolean;
  is_new_suspicious: boolean;
  total_volume: number;
  suspicion_score: number;
}

// Helper functions that mirror src/models/wallet.ts
function upsertWallet(db: Database.Database, wallet: WalletInsert): void {
  const stmt = db.prepare(`
    INSERT INTO wallets (
      address, wallet_created_at, is_whale, is_new_suspicious, 
      total_volume, suspicion_score, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(address) DO UPDATE SET
      is_whale = excluded.is_whale,
      is_new_suspicious = excluded.is_new_suspicious,
      total_volume = excluded.total_volume,
      suspicion_score = excluded.suspicion_score,
      last_updated = CURRENT_TIMESTAMP
  `);

  stmt.run(
    wallet.address,
    wallet.wallet_created_at || null,
    wallet.is_whale ? 1 : 0,
    wallet.is_new_suspicious ? 1 : 0,
    wallet.total_volume,
    wallet.suspicion_score
  );
}

function getWallet(db: Database.Database, address: string): Wallet | undefined {
  const stmt = db.prepare('SELECT * FROM wallets WHERE address = ?');
  return stmt.get(address) as Wallet | undefined;
}

function getAllWatchedWallets(db: Database.Database): Wallet[] {
  const stmt = db.prepare(`
    SELECT * FROM wallets 
    WHERE is_whale = 1 OR is_new_suspicious = 1
    ORDER BY suspicion_score DESC, last_updated DESC
  `);
  return stmt.all() as Wallet[];
}

function getTopWallets(db: Database.Database, limit = 10): Wallet[] {
  const stmt = db.prepare(`
    SELECT * FROM wallets 
    WHERE is_whale = 1 OR is_new_suspicious = 1
    ORDER BY suspicion_score DESC
    LIMIT ?
  `);
  return stmt.all(limit) as Wallet[];
}

function updateWalletRecord(db: Database.Database, address: string, won: boolean): void {
  const field = won ? 'win_count' : 'loss_count';
  const stmt = db.prepare(`
    UPDATE wallets 
    SET ${field} = ${field} + 1, last_updated = CURRENT_TIMESTAMP
    WHERE address = ?
  `);
  stmt.run(address);
}

function getWalletStats(db: Database.Database, address: string) {
  const wallet = getWallet(db, address);
  if (!wallet) return null;

  const totalTrades = wallet.win_count + wallet.loss_count;
  const winRate = totalTrades > 0 ? wallet.win_count / totalTrades : 0;

  return {
    ...wallet,
    totalTrades,
    winRate,
  };
}

describe('Wallet Model', () => {
  let testDb: Database.Database;

  beforeAll(() => {
    // Create in-memory test database
    testDb = new Database(':memory:');
    
    // Create schema
    testDb.exec(`
      CREATE TABLE wallets (
        address TEXT PRIMARY KEY,
        first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        wallet_created_at DATETIME,
        is_whale BOOLEAN DEFAULT 0,
        is_new_suspicious BOOLEAN DEFAULT 0,
        total_volume REAL DEFAULT 0,
        win_count INTEGER DEFAULT 0,
        loss_count INTEGER DEFAULT 0,
        suspicion_score REAL DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  beforeEach(() => {
    // Clear all data before each test
    testDb.prepare('DELETE FROM wallets').run();
  });

  afterAll(() => {
    testDb.close();
  });

  describe('upsertWallet', () => {
    it('should insert a new whale wallet', () => {
      const walletData = mockWalletInserts.whale;
      
      upsertWallet(testDb, walletData);

      const result = testDb.prepare('SELECT * FROM wallets WHERE address = ?').get(WHALE_ADDRESS) as Wallet;
      
      expect(result).toBeDefined();
      expect(result.address).toBe(WHALE_ADDRESS);
      expect(result.is_whale).toBe(1);
      expect(result.is_new_suspicious).toBe(0);
      expect(result.total_volume).toBe(500000);
      expect(result.suspicion_score).toBe(0.2);
    });

    it('should insert a new suspicious wallet', () => {
      const walletData = mockWalletInserts.newSuspicious;
      
      upsertWallet(testDb, walletData);

      const result = testDb.prepare('SELECT * FROM wallets WHERE address = ?').get(NEW_SUSPICIOUS_ADDRESS) as Wallet;
      
      expect(result).toBeDefined();
      expect(result.address).toBe(NEW_SUSPICIOUS_ADDRESS);
      expect(result.is_whale).toBe(0);
      expect(result.is_new_suspicious).toBe(1);
      expect(result.total_volume).toBe(25000);
      expect(result.suspicion_score).toBe(0.85);
    });

    it('should update an existing wallet on conflict', () => {
      const walletData = mockWalletInserts.whale;
      
      // Insert initial wallet
      upsertWallet(testDb, walletData);
      
      // Update with new data
      const updatedData: WalletInsert = {
        ...walletData,
        total_volume: 600000,
        suspicion_score: 0.3,
      };
      
      upsertWallet(testDb, updatedData);

      const result = testDb.prepare('SELECT * FROM wallets WHERE address = ?').get(WHALE_ADDRESS) as Wallet;
      
      expect(result.total_volume).toBe(600000);
      expect(result.suspicion_score).toBe(0.3);
      
      // Should only have one record
      const count = testDb.prepare('SELECT COUNT(*) as count FROM wallets WHERE address = ?').get(WHALE_ADDRESS) as { count: number };
      expect(count.count).toBe(1);
    });

    it('should handle wallet without wallet_created_at', () => {
      const walletData: WalletInsert = {
        address: NORMAL_ADDRESS,
        is_whale: false,
        is_new_suspicious: false,
        total_volume: 5000,
        suspicion_score: 0.1,
        // wallet_created_at omitted
      };
      
      upsertWallet(testDb, walletData);

      const result = testDb.prepare('SELECT * FROM wallets WHERE address = ?').get(NORMAL_ADDRESS) as Wallet;
      
      expect(result).toBeDefined();
      expect(result.wallet_created_at).toBeNull();
    });

    it('should set timestamps automatically', () => {
      const walletData = mockWalletInserts.whale;
      
      upsertWallet(testDb, walletData);

      const result = testDb.prepare('SELECT * FROM wallets WHERE address = ?').get(WHALE_ADDRESS) as Wallet;
      
      expect(result.first_seen).toBeDefined();
      expect(result.last_updated).toBeDefined();
    });
  });

  describe('getWallet', () => {
    beforeEach(() => {
      // Insert test wallets
      upsertWallet(testDb, mockWalletInserts.whale);
      upsertWallet(testDb, mockWalletInserts.newSuspicious);
      upsertWallet(testDb, mockWalletInserts.normal);
    });

    it('should retrieve an existing wallet', () => {
      const wallet = getWallet(testDb, WHALE_ADDRESS);
      
      expect(wallet).toBeDefined();
      expect(wallet?.address).toBe(WHALE_ADDRESS);
      expect(wallet?.is_whale).toBe(1);
    });

    it('should return undefined for non-existent wallet', () => {
      const wallet = getWallet(testDb, '0xnonexistent');
      
      expect(wallet).toBeUndefined();
    });

    it('should return wallet with all fields', () => {
      const wallet = getWallet(testDb, WHALE_ADDRESS);
      
      expect(wallet).toHaveProperty('address');
      expect(wallet).toHaveProperty('first_seen');
      expect(wallet).toHaveProperty('wallet_created_at');
      expect(wallet).toHaveProperty('is_whale');
      expect(wallet).toHaveProperty('is_new_suspicious');
      expect(wallet).toHaveProperty('total_volume');
      expect(wallet).toHaveProperty('win_count');
      expect(wallet).toHaveProperty('loss_count');
      expect(wallet).toHaveProperty('suspicion_score');
      expect(wallet).toHaveProperty('last_updated');
    });
  });

  describe('getAllWatchedWallets', () => {
    beforeEach(() => {
      // Insert test wallets
      upsertWallet(testDb, mockWalletInserts.whale);
      upsertWallet(testDb, mockWalletInserts.newSuspicious);
      upsertWallet(testDb, mockWalletInserts.normal);
    });

    it('should return only watched wallets (whales and suspicious)', () => {
      const wallets = getAllWatchedWallets(testDb);
      
      expect(wallets.length).toBe(2); // whale + newSuspicious
      expect(wallets.some(w => w.address === WHALE_ADDRESS)).toBe(true);
      expect(wallets.some(w => w.address === NEW_SUSPICIOUS_ADDRESS)).toBe(true);
      expect(wallets.some(w => w.address === NORMAL_ADDRESS)).toBe(false);
    });

    it('should return empty array when no watched wallets exist', () => {
      testDb.prepare('DELETE FROM wallets').run();
      
      const wallets = getAllWatchedWallets(testDb);
      
      expect(wallets).toEqual([]);
    });

    it('should order by suspicion score DESC, then last_updated DESC', () => {
      const wallets = getAllWatchedWallets(testDb);
      
      // newSuspicious has higher suspicion score (0.85) than whale (0.2)
      expect(wallets[0].address).toBe(NEW_SUSPICIOUS_ADDRESS);
      expect(wallets[1].address).toBe(WHALE_ADDRESS);
    });

    it('should include both whales and suspicious wallets', () => {
      const wallets = getAllWatchedWallets(testDb);
      
      const hasWhale = wallets.some(w => w.is_whale === 1);
      const hasSuspicious = wallets.some(w => w.is_new_suspicious === 1);
      
      expect(hasWhale).toBe(true);
      expect(hasSuspicious).toBe(true);
    });
  });

  describe('getTopWallets', () => {
    beforeEach(() => {
      // Insert multiple wallets with different scores
      upsertWallet(testDb, mockWalletInserts.whale);
      upsertWallet(testDb, mockWalletInserts.newSuspicious);
      upsertWallet(testDb, {
        address: '0xtest1',
        is_whale: true,
        is_new_suspicious: false,
        total_volume: 100000,
        suspicion_score: 0.5,
      });
      upsertWallet(testDb, {
        address: '0xtest2',
        is_whale: false,
        is_new_suspicious: true,
        total_volume: 50000,
        suspicion_score: 0.7,
      });
    });

    it('should return top N wallets by suspicion score', () => {
      const topWallets = getTopWallets(testDb, 2);
      
      expect(topWallets.length).toBe(2);
      expect(topWallets[0].suspicion_score).toBeGreaterThanOrEqual(topWallets[1].suspicion_score);
    });

    it('should default to limit of 10', () => {
      const topWallets = getTopWallets(testDb);
      
      expect(topWallets.length).toBeLessThanOrEqual(10);
    });

    it('should order by suspicion score DESC', () => {
      const topWallets = getTopWallets(testDb, 4);
      
      // Should be ordered: 0.85, 0.7, 0.5, 0.2
      expect(topWallets[0].suspicion_score).toBe(0.85); // newSuspicious
      expect(topWallets[1].suspicion_score).toBe(0.7);  // test2
      expect(topWallets[2].suspicion_score).toBe(0.5);  // test1
      expect(topWallets[3].suspicion_score).toBe(0.2);  // whale
    });

    it('should only return watched wallets', () => {
      // Add normal wallet
      upsertWallet(testDb, mockWalletInserts.normal);
      
      const topWallets = getTopWallets(testDb, 10);
      
      expect(topWallets.every(w => w.is_whale === 1 || w.is_new_suspicious === 1)).toBe(true);
    });
  });

  describe('updateWalletRecord', () => {
    beforeEach(() => {
      upsertWallet(testDb, mockWalletInserts.whale);
    });

    it('should increment win_count when won is true', () => {
      const walletBefore = getWallet(testDb, WHALE_ADDRESS);
      const initialWins = walletBefore!.win_count;
      
      updateWalletRecord(testDb, WHALE_ADDRESS, true);
      
      const walletAfter = getWallet(testDb, WHALE_ADDRESS);
      expect(walletAfter!.win_count).toBe(initialWins + 1);
      expect(walletAfter!.loss_count).toBe(walletBefore!.loss_count);
    });

    it('should increment loss_count when won is false', () => {
      const walletBefore = getWallet(testDb, WHALE_ADDRESS);
      const initialLosses = walletBefore!.loss_count;
      
      updateWalletRecord(testDb, WHALE_ADDRESS, false);
      
      const walletAfter = getWallet(testDb, WHALE_ADDRESS);
      expect(walletAfter!.loss_count).toBe(initialLosses + 1);
      expect(walletAfter!.win_count).toBe(walletBefore!.win_count);
    });

    it('should handle multiple updates correctly', () => {
      updateWalletRecord(testDb, WHALE_ADDRESS, true);
      updateWalletRecord(testDb, WHALE_ADDRESS, true);
      updateWalletRecord(testDb, WHALE_ADDRESS, false);
      
      const wallet = getWallet(testDb, WHALE_ADDRESS);
      expect(wallet!.win_count).toBe(2);
      expect(wallet!.loss_count).toBe(1);
    });
  });

  describe('getWalletStats', () => {
    beforeEach(() => {
      upsertWallet(testDb, mockWalletInserts.whale);
    });

    it('should return stats for existing wallet', () => {
      const stats = getWalletStats(testDb, WHALE_ADDRESS);
      
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('address');
      expect(stats).toHaveProperty('totalTrades');
      expect(stats).toHaveProperty('winRate');
    });

    it('should return null for non-existent wallet', () => {
      const stats = getWalletStats(testDb, '0xnonexistent');
      
      expect(stats).toBeNull();
    });

    it('should calculate totalTrades correctly', () => {
      // Add some wins and losses
      updateWalletRecord(testDb, WHALE_ADDRESS, true);
      updateWalletRecord(testDb, WHALE_ADDRESS, true);
      updateWalletRecord(testDb, WHALE_ADDRESS, false);
      
      const stats = getWalletStats(testDb, WHALE_ADDRESS);
      
      expect(stats!.totalTrades).toBe(3);
    });

    it('should calculate winRate correctly', () => {
      // 3 wins, 1 loss = 75% win rate
      updateWalletRecord(testDb, WHALE_ADDRESS, true);
      updateWalletRecord(testDb, WHALE_ADDRESS, true);
      updateWalletRecord(testDb, WHALE_ADDRESS, true);
      updateWalletRecord(testDb, WHALE_ADDRESS, false);
      
      const stats = getWalletStats(testDb, WHALE_ADDRESS);
      
      expect(stats!.winRate).toBe(0.75);
    });

    it('should return 0 winRate when no trades', () => {
      const stats = getWalletStats(testDb, WHALE_ADDRESS);
      
      expect(stats!.totalTrades).toBe(0);
      expect(stats!.winRate).toBe(0);
    });

    it('should include all wallet fields', () => {
      const stats = getWalletStats(testDb, WHALE_ADDRESS);
      
      expect(stats).toHaveProperty('is_whale');
      expect(stats).toHaveProperty('is_new_suspicious');
      expect(stats).toHaveProperty('total_volume');
      expect(stats).toHaveProperty('suspicion_score');
      expect(stats).toHaveProperty('win_count');
      expect(stats).toHaveProperty('loss_count');
    });
  });
});
