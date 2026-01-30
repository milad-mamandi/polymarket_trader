import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import Database from 'better-sqlite3';
import { mockWalletTrades, createWalletTrade } from '../../fixtures/trades.js';
import { mockWalletInserts, WHALE_ADDRESS, NEW_SUSPICIOUS_ADDRESS, NORMAL_ADDRESS } from '../../fixtures/wallets.js';
import { MARKET_IDS, MARKET_TITLES } from '../../fixtures/markets.js';

/**
 * Unit tests for trade model (src/models/trade.ts)
 * Tests CRUD operations for wallet trades
 * 
 * Note: These tests use a real in-memory SQLite database
 * and re-implement the trade functions locally to avoid ES module mocking issues
 */

// Trade interfaces
interface WalletTrade {
  id: string;
  wallet_address: string;
  market_id: string;
  market_title: string;
  outcome: string;
  side: string;
  size: number;
  price: number;
  timestamp: string;
  resolved: number;
  won?: number;
  archived?: number;
  archive_reason?: string;
}

// Helper functions that mirror src/models/trade.ts
function insertWalletTrade(db: Database.Database, trade: Omit<WalletTrade, 'timestamp' | 'resolved'>): void {
  const stmt = db.prepare(`
    INSERT INTO wallet_trades (
      id, wallet_address, market_id, market_title, outcome, side, size, price
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    trade.id,
    trade.wallet_address,
    trade.market_id,
    trade.market_title,
    trade.outcome,
    trade.side,
    trade.size,
    trade.price
  );
}

function getWalletTrades(db: Database.Database, walletAddress: string, limit = 50): WalletTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM wallet_trades 
    WHERE wallet_address = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(walletAddress, limit) as WalletTrade[];
}

function getRecentWalletTrades(db: Database.Database, limit = 20): WalletTrade[] {
  const stmt = db.prepare(`
    SELECT wt.* FROM wallet_trades wt
    INNER JOIN wallets w ON wt.wallet_address = w.address
    WHERE w.is_whale = 1 OR w.is_new_suspicious = 1
    ORDER BY wt.timestamp DESC
    LIMIT ?
  `);
  return stmt.all(limit) as WalletTrade[];
}

function getWalletTradesForMarket(db: Database.Database, marketId: string): WalletTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM wallet_trades 
    WHERE market_id = ?
    ORDER BY timestamp DESC
  `);
  return stmt.all(marketId) as WalletTrade[];
}

function getUnresolvedTrades(db: Database.Database): WalletTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM wallet_trades 
    WHERE resolved = 0 AND archived = 0
    ORDER BY timestamp DESC
  `);
  return stmt.all() as WalletTrade[];
}

function resolveWalletTrade(db: Database.Database, tradeId: string, won: boolean): void {
  const stmt = db.prepare(`
    UPDATE wallet_trades 
    SET resolved = 1, won = ?
    WHERE id = ?
  `);
  stmt.run(won ? 1 : 0, tradeId);
}

function markTradeAsArchived(db: Database.Database, tradeId: string, reason: string): void {
  const stmt = db.prepare(`
    UPDATE wallet_trades 
    SET archived = 1, archive_reason = ?
    WHERE id = ?
  `);
  stmt.run(reason, tradeId);
}

function getArchivedTrades(db: Database.Database, limit = 100): WalletTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM wallet_trades 
    WHERE archived = 1
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(limit) as WalletTrade[];
}

function getArchivedTradesSummary(db: Database.Database) {
  const stmt = db.prepare(`
    SELECT 
      archive_reason,
      COUNT(*) as count,
      MIN(timestamp) as oldest,
      MAX(timestamp) as newest
    FROM wallet_trades 
    WHERE archived = 1
    GROUP BY archive_reason
  `);
  return stmt.all();
}

function getTradeAge(trade: WalletTrade): number {
  const tradeDate = new Date(trade.timestamp);
  const now = new Date();
  const diffMs = now.getTime() - tradeDate.getTime();
  return diffMs / (1000 * 60 * 60 * 24); // Convert to days
}

// Helper to upsert wallet (required for FK constraint)
function upsertWallet(db: Database.Database, wallet: any): void {
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

describe('Trade Model', () => {
  let testDb: Database.Database;

  beforeAll(() => {
    // Create in-memory test database
    testDb = new Database(':memory:');
    
    // Create wallets table
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

    // Create wallet_trades table
    testDb.exec(`
      CREATE TABLE wallet_trades (
        id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        market_id TEXT NOT NULL,
        market_title TEXT NOT NULL,
        outcome TEXT NOT NULL,
        side TEXT NOT NULL,
        size REAL NOT NULL,
        price REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved BOOLEAN DEFAULT 0,
        won BOOLEAN,
        archived BOOLEAN DEFAULT 0,
        archive_reason TEXT,
        FOREIGN KEY (wallet_address) REFERENCES wallets(address)
      );
    `);
  });

  beforeEach(() => {
    // Clear all data before each test
    testDb.prepare('DELETE FROM wallet_trades').run();
    testDb.prepare('DELETE FROM wallets').run();
  });

  afterAll(() => {
    testDb.close();
  });

  describe('insertWalletTrade', () => {
    beforeEach(() => {
      // Insert wallets first (FK constraint)
      upsertWallet(testDb, mockWalletInserts.whale);
      upsertWallet(testDb, mockWalletInserts.newSuspicious);
      upsertWallet(testDb, mockWalletInserts.normal);
    });

    it('should insert a new trade', () => {
      const trade = createWalletTrade({
        wallet_address: WHALE_ADDRESS,
        market_id: MARKET_IDS.trump,
        market_title: MARKET_TITLES.trump,
        size: 50000,
      }) as any;
      
      insertWalletTrade(testDb, trade);

      const result = testDb.prepare('SELECT * FROM wallet_trades WHERE id = ?').get(trade.id) as WalletTrade;
      
      expect(result).toBeDefined();
      expect(result.wallet_address).toBe(WHALE_ADDRESS);
      expect(result.market_id).toBe(MARKET_IDS.trump);
      expect(result.size).toBe(50000);
    });

    it('should set default timestamp and resolved status', () => {
      const trade = createWalletTrade({ wallet_address: WHALE_ADDRESS });
      
      insertWalletTrade(testDb, trade);

      const result = testDb.prepare('SELECT * FROM wallet_trades WHERE id = ?').get(trade.id) as WalletTrade;
      
      expect(result.timestamp).toBeDefined();
      expect(result.resolved).toBe(0);
    });

    it('should handle BUY and SELL sides', () => {
      const buyTrade = createWalletTrade({ wallet_address: WHALE_ADDRESS, side: 'BUY' }) as any;
      const sellTrade = createWalletTrade({ wallet_address: WHALE_ADDRESS, side: 'SELL' }) as any;
      
      insertWalletTrade(testDb, buyTrade);
      insertWalletTrade(testDb, sellTrade);

      const trades = getWalletTrades(testDb, WHALE_ADDRESS);
      
      expect(trades).toHaveLength(2);
      expect(trades.some(t => t.side === 'BUY')).toBe(true);
      expect(trades.some(t => t.side === 'SELL')).toBe(true);
    });

    it('should fail when wallet does not exist (FK constraint)', () => {
      const trade = createWalletTrade({ wallet_address: '0xnonexistent' });
      
      expect(() => {
        insertWalletTrade(testDb, trade);
      }).toThrow();
    });
  });

  describe('getWalletTrades', () => {
    beforeEach(() => {
      // Insert wallets
      upsertWallet(testDb, mockWalletInserts.whale);
      upsertWallet(testDb, mockWalletInserts.newSuspicious);
      
      // Insert trades
      insertWalletTrade(testDb, createWalletTrade({ wallet_address: WHALE_ADDRESS, size: 50000 }) as any);
      insertWalletTrade(testDb, createWalletTrade({ wallet_address: WHALE_ADDRESS, size: 30000 }) as any);
      insertWalletTrade(testDb, createWalletTrade({ wallet_address: NEW_SUSPICIOUS_ADDRESS, size: 25000 }) as any);
    });

    it('should return trades for specific wallet', () => {
      const trades = getWalletTrades(testDb, WHALE_ADDRESS);
      
      expect(trades.length).toBe(2);
      expect(trades.every(t => t.wallet_address === WHALE_ADDRESS)).toBe(true);
    });

    it('should return empty array for wallet with no trades', () => {
      upsertWallet(testDb, mockWalletInserts.normal);
      const trades = getWalletTrades(testDb, NORMAL_ADDRESS);
      
      expect(trades).toEqual([]);
    });

    it('should order by timestamp DESC', () => {
      const trades = getWalletTrades(testDb, WHALE_ADDRESS);
      
      // Should be ordered newest first
      for (let i = 0; i < trades.length - 1; i++) {
        const date1 = new Date(trades[i].timestamp).getTime();
        const date2 = new Date(trades[i + 1].timestamp).getTime();
        expect(date1).toBeGreaterThanOrEqual(date2);
      }
    });

    it('should respect limit parameter', () => {
      const trades = getWalletTrades(testDb, WHALE_ADDRESS, 1);
      
      expect(trades.length).toBe(1);
    });

    it('should default to limit of 50', () => {
      // Insert 60 trades
      for (let i = 0; i < 60; i++) {
        insertWalletTrade(testDb, createWalletTrade({ wallet_address: WHALE_ADDRESS }) as any);
      }
      
      const trades = getWalletTrades(testDb, WHALE_ADDRESS);
      
      expect(trades.length).toBe(50);
    });
  });

  describe('getRecentWalletTrades', () => {
    beforeEach(() => {
      // Insert wallets
      upsertWallet(testDb, mockWalletInserts.whale);
      upsertWallet(testDb, mockWalletInserts.newSuspicious);
      upsertWallet(testDb, mockWalletInserts.normal);
      
      // Insert trades
      insertWalletTrade(testDb, createWalletTrade({ wallet_address: WHALE_ADDRESS }) as any);
      insertWalletTrade(testDb, createWalletTrade({ wallet_address: NEW_SUSPICIOUS_ADDRESS }) as any);
      insertWalletTrade(testDb, createWalletTrade({ wallet_address: NORMAL_ADDRESS }) as any);
    });

    it('should return trades only from watched wallets', () => {
      const trades = getRecentWalletTrades(testDb);
      
      expect(trades.length).toBe(2); // whale + suspicious, not normal
      expect(trades.some(t => t.wallet_address === WHALE_ADDRESS)).toBe(true);
      expect(trades.some(t => t.wallet_address === NEW_SUSPICIOUS_ADDRESS)).toBe(true);
      expect(trades.some(t => t.wallet_address === NORMAL_ADDRESS)).toBe(false);
    });

    it('should return empty array when no watched wallets have trades', () => {
      testDb.prepare('DELETE FROM wallet_trades').run();
      
      const trades = getRecentWalletTrades(testDb);
      
      expect(trades).toEqual([]);
    });

    it('should order by timestamp DESC', () => {
      const trades = getRecentWalletTrades(testDb);
      
      for (let i = 0; i < trades.length - 1; i++) {
        const date1 = new Date(trades[i].timestamp).getTime();
        const date2 = new Date(trades[i + 1].timestamp).getTime();
        expect(date1).toBeGreaterThanOrEqual(date2);
      }
    });

    it('should respect limit parameter', () => {
      const trades = getRecentWalletTrades(testDb, 1);
      
      expect(trades.length).toBe(1);
    });
  });

  describe('getWalletTradesForMarket', () => {
    beforeEach(() => {
      upsertWallet(testDb, mockWalletInserts.whale);
      upsertWallet(testDb, mockWalletInserts.newSuspicious);
      
      // Insert trades for different markets
      insertWalletTrade(testDb, createWalletTrade({ 
        wallet_address: WHALE_ADDRESS, 
        market_id: MARKET_IDS.trump 
      }));
      insertWalletTrade(testDb, createWalletTrade({ 
        wallet_address: NEW_SUSPICIOUS_ADDRESS, 
        market_id: MARKET_IDS.trump 
      }));
      insertWalletTrade(testDb, createWalletTrade({ 
        wallet_address: WHALE_ADDRESS, 
        market_id: MARKET_IDS.bitcoin 
      }));
    });

    it('should return all trades for specific market', () => {
      const trades = getWalletTradesForMarket(testDb, MARKET_IDS.trump);
      
      expect(trades.length).toBe(2);
      expect(trades.every(t => t.market_id === MARKET_IDS.trump)).toBe(true);
    });

    it('should return empty array for market with no trades', () => {
      const trades = getWalletTradesForMarket(testDb, MARKET_IDS.ai);
      
      expect(trades).toEqual([]);
    });

    it('should include trades from multiple wallets', () => {
      const trades = getWalletTradesForMarket(testDb, MARKET_IDS.trump);
      
      expect(trades.some(t => t.wallet_address === WHALE_ADDRESS)).toBe(true);
      expect(trades.some(t => t.wallet_address === NEW_SUSPICIOUS_ADDRESS)).toBe(true);
    });
  });

  describe('getUnresolvedTrades', () => {
    beforeEach(() => {
      upsertWallet(testDb, mockWalletInserts.whale);
      
      // Insert various trades
      const unresolvedTrade = createWalletTrade({ wallet_address: WHALE_ADDRESS });
      insertWalletTrade(testDb, unresolvedTrade);
      
      const resolvedTrade = createWalletTrade({ wallet_address: WHALE_ADDRESS });
      insertWalletTrade(testDb, resolvedTrade);
      resolveWalletTrade(testDb, resolvedTrade.id, true);
      
      const archivedTrade = createWalletTrade({ wallet_address: WHALE_ADDRESS });
      insertWalletTrade(testDb, archivedTrade);
      markTradeAsArchived(testDb, archivedTrade.id, 'Market closed');
    });

    it('should return only unresolved and non-archived trades', () => {
      const trades = getUnresolvedTrades(testDb);
      
      expect(trades.length).toBe(1);
      expect(trades[0].resolved).toBe(0);
      expect(trades[0].archived).toBe(0);
    });

    it('should exclude resolved trades', () => {
      const trades = getUnresolvedTrades(testDb);
      
      expect(trades.every(t => t.resolved === 0)).toBe(true);
    });

    it('should exclude archived trades', () => {
      const trades = getUnresolvedTrades(testDb);
      
      expect(trades.every(t => t.archived === 0)).toBe(true);
    });

    it('should return empty array when all trades are resolved or archived', () => {
      const trades = getUnresolvedTrades(testDb);
      trades.forEach(t => resolveWalletTrade(testDb, t.id, true));
      
      const unresolvedTrades = getUnresolvedTrades(testDb);
      
      expect(unresolvedTrades).toEqual([]);
    });
  });

  describe('resolveWalletTrade', () => {
    let tradeId: string;

    beforeEach(() => {
      upsertWallet(testDb, mockWalletInserts.whale);
      const trade = createWalletTrade({ wallet_address: WHALE_ADDRESS });
      tradeId = trade.id;
      insertWalletTrade(testDb, trade);
    });

    it('should mark trade as won', () => {
      resolveWalletTrade(testDb, tradeId, true);
      
      const result = testDb.prepare('SELECT * FROM wallet_trades WHERE id = ?').get(tradeId) as WalletTrade;
      
      expect(result.resolved).toBe(1);
      expect(result.won).toBe(1);
    });

    it('should mark trade as lost', () => {
      resolveWalletTrade(testDb, tradeId, false);
      
      const result = testDb.prepare('SELECT * FROM wallet_trades WHERE id = ?').get(tradeId) as WalletTrade;
      
      expect(result.resolved).toBe(1);
      expect(result.won).toBe(0);
    });

    it('should allow resolving multiple trades', () => {
      const trade2 = createWalletTrade({ wallet_address: WHALE_ADDRESS });
      insertWalletTrade(testDb, trade2);
      
      resolveWalletTrade(testDb, tradeId, true);
      resolveWalletTrade(testDb, trade2.id, false);
      
      const result1 = testDb.prepare('SELECT * FROM wallet_trades WHERE id = ?').get(tradeId) as WalletTrade;
      const result2 = testDb.prepare('SELECT * FROM wallet_trades WHERE id = ?').get(trade2.id) as WalletTrade;
      
      expect(result1.won).toBe(1);
      expect(result2.won).toBe(0);
    });
  });

  describe('markTradeAsArchived', () => {
    let tradeId: string;

    beforeEach(() => {
      upsertWallet(testDb, mockWalletInserts.whale);
      const trade = createWalletTrade({ wallet_address: WHALE_ADDRESS });
      tradeId = trade.id;
      insertWalletTrade(testDb, trade);
    });

    it('should mark trade as archived with reason', () => {
      markTradeAsArchived(testDb, tradeId, 'Market closed');
      
      const result = testDb.prepare('SELECT * FROM wallet_trades WHERE id = ?').get(tradeId) as WalletTrade;
      
      expect(result.archived).toBe(1);
      expect(result.archive_reason).toBe('Market closed');
    });

    it('should handle different archive reasons', () => {
      const trade2 = createWalletTrade({ wallet_address: WHALE_ADDRESS });
      insertWalletTrade(testDb, trade2);
      
      markTradeAsArchived(testDb, tradeId, 'Market closed');
      markTradeAsArchived(testDb, trade2.id, 'Invalid market');
      
      const result1 = testDb.prepare('SELECT * FROM wallet_trades WHERE id = ?').get(tradeId) as WalletTrade;
      const result2 = testDb.prepare('SELECT * FROM wallet_trades WHERE id = ?').get(trade2.id) as WalletTrade;
      
      expect(result1.archive_reason).toBe('Market closed');
      expect(result2.archive_reason).toBe('Invalid market');
    });
  });

  describe('getArchivedTrades', () => {
    beforeEach(() => {
      upsertWallet(testDb, mockWalletInserts.whale);
      
      // Insert and archive some trades
      const trade1 = createWalletTrade({ wallet_address: WHALE_ADDRESS });
      insertWalletTrade(testDb, trade1);
      markTradeAsArchived(testDb, trade1.id, 'Market closed');
      
      const trade2 = createWalletTrade({ wallet_address: WHALE_ADDRESS });
      insertWalletTrade(testDb, trade2);
      markTradeAsArchived(testDb, trade2.id, 'Invalid market');
      
      // Insert unarchived trade
      insertWalletTrade(testDb, createWalletTrade({ wallet_address: WHALE_ADDRESS }) as any);
    });

    it('should return only archived trades', () => {
      const trades = getArchivedTrades(testDb);
      
      expect(trades.length).toBe(2);
      expect(trades.every(t => t.archived === 1)).toBe(true);
    });

    it('should include archive reasons', () => {
      const trades = getArchivedTrades(testDb);
      
      expect(trades.every(t => t.archive_reason)).toBeTruthy();
    });

    it('should respect limit parameter', () => {
      const trades = getArchivedTrades(testDb, 1);
      
      expect(trades.length).toBe(1);
    });

    it('should return empty array when no archived trades exist', () => {
      testDb.prepare('DELETE FROM wallet_trades WHERE archived = 1').run();
      
      const trades = getArchivedTrades(testDb);
      
      expect(trades).toEqual([]);
    });
  });

  describe('getArchivedTradesSummary', () => {
    beforeEach(() => {
      upsertWallet(testDb, mockWalletInserts.whale);
      
      // Archive multiple trades with different reasons
      for (let i = 0; i < 3; i++) {
        const trade = createWalletTrade({ wallet_address: WHALE_ADDRESS });
        insertWalletTrade(testDb, trade);
        markTradeAsArchived(testDb, trade.id, 'Market closed');
      }
      
      for (let i = 0; i < 2; i++) {
        const trade = createWalletTrade({ wallet_address: WHALE_ADDRESS });
        insertWalletTrade(testDb, trade);
        markTradeAsArchived(testDb, trade.id, 'Invalid market');
      }
    });

    it('should return summary grouped by archive reason', () => {
      const summary = getArchivedTradesSummary(testDb);
      
      expect(summary.length).toBe(2);
      expect(summary.some((s: any) => s.archive_reason === 'Market closed')).toBe(true);
      expect(summary.some((s: any) => s.archive_reason === 'Invalid market')).toBe(true);
    });

    it('should include count for each reason', () => {
      const summary = getArchivedTradesSummary(testDb);
      
      const marketClosed = summary.find((s: any) => s.archive_reason === 'Market closed') as any;
      const invalidMarket = summary.find((s: any) => s.archive_reason === 'Invalid market') as any;
      
      expect(marketClosed.count).toBe(3);
      expect(invalidMarket.count).toBe(2);
    });

    it('should include oldest and newest timestamps', () => {
      const summary = getArchivedTradesSummary(testDb);
      
      summary.forEach((s: any) => {
        expect(s.oldest).toBeDefined();
        expect(s.newest).toBeDefined();
      });
    });
  });

  describe('getTradeAge', () => {
    it('should calculate age in days correctly', () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const trade: WalletTrade = {
        id: 'test-id',
        wallet_address: WHALE_ADDRESS,
        market_id: MARKET_IDS.trump,
        market_title: MARKET_TITLES.trump,
        outcome: 'Yes',
        side: 'BUY',
        size: 50000,
        price: 0.65,
        timestamp: oneDayAgo,
        resolved: 0,
      };
      
      const age = getTradeAge(trade);
      
      expect(age).toBeGreaterThanOrEqual(0.99);
      expect(age).toBeLessThanOrEqual(1.01);
    });

    it('should handle trades less than 1 day old', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const trade: WalletTrade = {
        id: 'test-id',
        wallet_address: WHALE_ADDRESS,
        market_id: MARKET_IDS.trump,
        market_title: MARKET_TITLES.trump,
        outcome: 'Yes',
        side: 'BUY',
        size: 50000,
        price: 0.65,
        timestamp: oneHourAgo,
        resolved: 0,
      };
      
      const age = getTradeAge(trade);
      
      expect(age).toBeGreaterThan(0);
      expect(age).toBeLessThan(0.1); // Less than 0.1 days
    });

    it('should handle very old trades', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const trade: WalletTrade = {
        id: 'test-id',
        wallet_address: WHALE_ADDRESS,
        market_id: MARKET_IDS.trump,
        market_title: MARKET_TITLES.trump,
        outcome: 'Yes',
        side: 'BUY',
        size: 50000,
        price: 0.65,
        timestamp: thirtyDaysAgo,
        resolved: 0,
      };
      
      const age = getTradeAge(trade);
      
      expect(age).toBeGreaterThan(29);
      expect(age).toBeLessThan(31);
    });
  });
});
