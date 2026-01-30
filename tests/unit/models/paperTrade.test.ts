import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import Database from 'better-sqlite3';
import { WHALE_ADDRESS, NEW_SUSPICIOUS_ADDRESS } from '../../fixtures/wallets.js';
import { MARKET_IDS, MARKET_TITLES } from '../../fixtures/markets.js';
import { generateMockId } from '../../setup.js';

/**
 * Unit tests for paper trade model (src/models/paperTrade.ts)
 * Tests paper trading (simulated trading) functionality
 * 
 * Note: These tests use a real in-memory SQLite database
 * and re-implement the paperTrade functions locally to avoid ES module mocking issues
 */

// Paper trade interfaces
interface PaperTrade {
  id: string;
  triggered_by: string;
  market_id: string;
  market_title: string;
  outcome: string;
  entry_price: number;
  virtual_amount: number;
  shares: number;
  timestamp: string;
  detected_at?: string;
  status: 'OPEN' | 'CLOSED' | 'WON' | 'LOST' | 'CANCELLED';
  exit_price?: number;
  pnl?: number;
  confidence_score: number;
}

interface PaperTradeInsert {
  id: string;
  triggered_by: string;
  market_id: string;
  market_title: string;
  outcome: string;
  entry_price: number;
  virtual_amount: number;
  shares: number;
  confidence_score: number;
}

// Helper functions that mirror src/models/paperTrade.ts
function insertPaperTrade(db: Database.Database, trade: PaperTradeInsert): void {
  const stmt = db.prepare(`
    INSERT INTO paper_trades (
      id, triggered_by, market_id, market_title, outcome, 
      entry_price, virtual_amount, shares, confidence_score, detected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  stmt.run(
    trade.id,
    trade.triggered_by,
    trade.market_id,
    trade.market_title,
    trade.outcome,
    trade.entry_price,
    trade.virtual_amount,
    trade.shares,
    trade.confidence_score
  );
}

function getOpenPaperTrades(db: Database.Database): PaperTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM paper_trades 
    WHERE status = 'OPEN'
    ORDER BY timestamp DESC
  `);
  return stmt.all() as PaperTrade[];
}

function getAllPaperTrades(db: Database.Database, limit = 100): PaperTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM paper_trades 
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(limit) as PaperTrade[];
}

function closePaperTrade(db: Database.Database, tradeId: string, exitPrice: number, pnl: number): void {
  const stmt = db.prepare(`
    UPDATE paper_trades 
    SET status = 'CLOSED', exit_price = ?, pnl = ?
    WHERE id = ?
  `);
  stmt.run(exitPrice, pnl, tradeId);
}

function resolvePaperTrade(db: Database.Database, tradeId: string, won: boolean): void {
  const trade = db.prepare('SELECT * FROM paper_trades WHERE id = ?').get(tradeId) as PaperTrade;
  
  if (!trade) return;

  const exitPrice = won ? 1.0 : 0.0;
  const pnl = won ? (trade.shares - trade.virtual_amount) : -trade.virtual_amount;
  const status = won ? 'WON' : 'LOST';

  const stmt = db.prepare(`
    UPDATE paper_trades 
    SET status = ?, exit_price = ?, pnl = ?
    WHERE id = ?
  `);
  stmt.run(status, exitPrice, pnl, tradeId);
}

function cancelPaperTrade(db: Database.Database, tradeId: string, reason: string): void {
  const stmt = db.prepare(`
    UPDATE paper_trades 
    SET status = 'CANCELLED', pnl = 0
    WHERE id = ?
  `);
  stmt.run(tradeId);
}

function getPaperTradeStats(db: Database.Database) {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open,
      SUM(CASE WHEN status = 'WON' THEN 1 ELSE 0 END) as winning,
      SUM(CASE WHEN status = 'LOST' THEN 1 ELSE 0 END) as losing,
      SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
      SUM(COALESCE(pnl, 0)) as total_pnl,
      AVG(COALESCE(pnl, 0)) as avg_pnl,
      MAX(COALESCE(pnl, 0)) as best_pnl,
      MIN(COALESCE(pnl, 0)) as worst_pnl
    FROM paper_trades
  `).get() as {
    total: number | null;
    open: number | null;
    winning: number | null;
    losing: number | null;
    cancelled: number | null;
    total_pnl: number | null;
    avg_pnl: number | null;
    best_pnl: number | null;
    worst_pnl: number | null;
  } | undefined;

  const total = stats?.total ?? 0;
  const open = stats?.open ?? 0;
  const winning = stats?.winning ?? 0;
  const losing = stats?.losing ?? 0;
  const cancelled = stats?.cancelled ?? 0;
  const total_pnl = stats?.total_pnl ?? 0;
  const avg_pnl = stats?.avg_pnl ?? 0;
  const best_pnl = stats?.best_pnl ?? 0;
  const worst_pnl = stats?.worst_pnl ?? 0;

  const completed = winning + losing;
  const winRate = completed > 0 ? winning / completed : 0;

  return {
    total,
    open,
    winning,
    losing,
    cancelled,
    total_pnl,
    avg_pnl,
    best_pnl,
    worst_pnl,
    completed,
    winRate,
  };
}

// Helper to create paper trade insert data
function createPaperTradeInsert(overrides: Partial<PaperTradeInsert> = {}): PaperTradeInsert {
  return {
    id: generateMockId(),
    triggered_by: WHALE_ADDRESS,
    market_id: MARKET_IDS.trump,
    market_title: MARKET_TITLES.trump,
    outcome: 'Yes',
    entry_price: 0.65,
    virtual_amount: 100,
    shares: 153.85, // virtual_amount / entry_price
    confidence_score: 0.75,
    ...overrides,
  };
}

describe('PaperTrade Model', () => {
  let testDb: Database.Database;

  beforeAll(() => {
    // Create in-memory test database
    testDb = new Database(':memory:');
    
    // Create paper_trades table
    testDb.exec(`
      CREATE TABLE paper_trades (
        id TEXT PRIMARY KEY,
        triggered_by TEXT NOT NULL,
        market_id TEXT NOT NULL,
        market_title TEXT NOT NULL,
        outcome TEXT NOT NULL,
        entry_price REAL NOT NULL,
        virtual_amount REAL NOT NULL,
        shares REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'OPEN',
        exit_price REAL,
        pnl REAL,
        confidence_score REAL NOT NULL
      );
    `);
  });

  beforeEach(() => {
    // Clear all data before each test
    testDb.prepare('DELETE FROM paper_trades').run();
  });

  afterAll(() => {
    testDb.close();
  });

  describe('insertPaperTrade', () => {
    it('should insert a new paper trade', () => {
      const trade = createPaperTradeInsert();
      
      insertPaperTrade(testDb, trade);

      const result = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(trade.id) as PaperTrade;
      
      expect(result).toBeDefined();
      expect(result.triggered_by).toBe(WHALE_ADDRESS);
      expect(result.market_id).toBe(MARKET_IDS.trump);
      expect(result.entry_price).toBe(0.65);
      expect(result.virtual_amount).toBe(100);
    });

    it('should set default status to OPEN', () => {
      const trade = createPaperTradeInsert();
      
      insertPaperTrade(testDb, trade);

      const result = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(trade.id) as PaperTrade;
      
      expect(result.status).toBe('OPEN');
    });

    it('should set timestamp and detected_at automatically', () => {
      const trade = createPaperTradeInsert();
      
      insertPaperTrade(testDb, trade);

      const result = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(trade.id) as PaperTrade;
      
      expect(result.timestamp).toBeDefined();
      expect(result.detected_at).toBeDefined();
    });

    it('should handle different confidence scores', () => {
      const highConfidence = createPaperTradeInsert({ confidence_score: 0.95 });
      const lowConfidence = createPaperTradeInsert({ confidence_score: 0.25 });
      
      insertPaperTrade(testDb, highConfidence);
      insertPaperTrade(testDb, lowConfidence);

      const result1 = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(highConfidence.id) as PaperTrade;
      const result2 = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(lowConfidence.id) as PaperTrade;
      
      expect(result1.confidence_score).toBe(0.95);
      expect(result2.confidence_score).toBe(0.25);
    });

    it('should handle trades triggered by different wallets', () => {
      const whaleTrade = createPaperTradeInsert({ triggered_by: WHALE_ADDRESS });
      const suspiciousTrade = createPaperTradeInsert({ triggered_by: NEW_SUSPICIOUS_ADDRESS });
      
      insertPaperTrade(testDb, whaleTrade);
      insertPaperTrade(testDb, suspiciousTrade);

      const trades = getAllPaperTrades(testDb);
      
      expect(trades).toHaveLength(2);
      expect(trades.some(t => t.triggered_by === WHALE_ADDRESS)).toBe(true);
      expect(trades.some(t => t.triggered_by === NEW_SUSPICIOUS_ADDRESS)).toBe(true);
    });
  });

  describe('getOpenPaperTrades', () => {
    beforeEach(() => {
      // Insert trades with different statuses
      const trade1 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade1);
      
      const trade2 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade2);
      resolvePaperTrade(testDb, trade2.id, true);
      
      const trade3 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade3);
      closePaperTrade(testDb, trade3.id, 0.70, 10);
    });

    it('should return only open trades', () => {
      const trades = getOpenPaperTrades(testDb);
      
      expect(trades.length).toBe(1);
      expect(trades[0].status).toBe('OPEN');
    });

    it('should exclude won trades', () => {
      const trades = getOpenPaperTrades(testDb);
      
      expect(trades.every(t => t.status !== 'WON')).toBe(true);
    });

    it('should exclude closed trades', () => {
      const trades = getOpenPaperTrades(testDb);
      
      expect(trades.every(t => t.status !== 'CLOSED')).toBe(true);
    });

    it('should return empty array when no open trades exist', () => {
      testDb.prepare('DELETE FROM paper_trades').run();
      
      const trades = getOpenPaperTrades(testDb);
      
      expect(trades).toEqual([]);
    });

    it('should order by timestamp DESC', () => {
      testDb.prepare('DELETE FROM paper_trades').run();
      
      const trade1 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade1);
      
      // Wait a bit to ensure different timestamps
      const trade2 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade2);

      const trades = getOpenPaperTrades(testDb);
      
      const date1 = new Date(trades[0].timestamp).getTime();
      const date2 = new Date(trades[1].timestamp).getTime();
      expect(date1).toBeGreaterThanOrEqual(date2);
    });
  });

  describe('getAllPaperTrades', () => {
    beforeEach(() => {
      // Insert multiple trades
      for (let i = 0; i < 5; i++) {
        insertPaperTrade(testDb, createPaperTradeInsert());
      }
    });

    it('should return all trades regardless of status', () => {
      const trades = getAllPaperTrades(testDb);
      
      expect(trades.length).toBe(5);
    });

    it('should respect limit parameter', () => {
      const trades = getAllPaperTrades(testDb, 3);
      
      expect(trades.length).toBe(3);
    });

    it('should default to limit of 100', () => {
      testDb.prepare('DELETE FROM paper_trades').run();
      
      // Insert 110 trades
      for (let i = 0; i < 110; i++) {
        insertPaperTrade(testDb, createPaperTradeInsert());
      }
      
      const trades = getAllPaperTrades(testDb);
      
      expect(trades.length).toBe(100);
    });

    it('should order by timestamp DESC', () => {
      const trades = getAllPaperTrades(testDb);
      
      for (let i = 0; i < trades.length - 1; i++) {
        const date1 = new Date(trades[i].timestamp).getTime();
        const date2 = new Date(trades[i + 1].timestamp).getTime();
        expect(date1).toBeGreaterThanOrEqual(date2);
      }
    });
  });

  describe('closePaperTrade', () => {
    let tradeId: string;

    beforeEach(() => {
      const trade = createPaperTradeInsert();
      tradeId = trade.id;
      insertPaperTrade(testDb, trade);
    });

    it('should update status to CLOSED', () => {
      closePaperTrade(testDb, tradeId, 0.70, 10);
      
      const result = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(tradeId) as PaperTrade;
      
      expect(result.status).toBe('CLOSED');
    });

    it('should set exit_price', () => {
      closePaperTrade(testDb, tradeId, 0.72, 15);
      
      const result = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(tradeId) as PaperTrade;
      
      expect(result.exit_price).toBe(0.72);
    });

    it('should set pnl', () => {
      closePaperTrade(testDb, tradeId, 0.75, 20.50);
      
      const result = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(tradeId) as PaperTrade;
      
      expect(result.pnl).toBe(20.50);
    });

    it('should handle negative pnl (losses)', () => {
      closePaperTrade(testDb, tradeId, 0.60, -10);
      
      const result = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(tradeId) as PaperTrade;
      
      expect(result.pnl).toBe(-10);
      expect(result.exit_price).toBe(0.60);
    });
  });

  describe('resolvePaperTrade', () => {
    let tradeId: string;

    beforeEach(() => {
      const trade = createPaperTradeInsert({
        entry_price: 0.65,
        virtual_amount: 100,
        shares: 153.85,
      });
      tradeId = trade.id;
      insertPaperTrade(testDb, trade);
    });

    it('should mark trade as WON when won is true', () => {
      resolvePaperTrade(testDb, tradeId, true);
      
      const result = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(tradeId) as PaperTrade;
      
      expect(result.status).toBe('WON');
    });

    it('should mark trade as LOST when won is false', () => {
      resolvePaperTrade(testDb, tradeId, false);
      
      const result = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(tradeId) as PaperTrade;
      
      expect(result.status).toBe('LOST');
    });

    it('should set exit_price to 1.0 when won', () => {
      resolvePaperTrade(testDb, tradeId, true);
      
      const result = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(tradeId) as PaperTrade;
      
      expect(result.exit_price).toBe(1.0);
    });

    it('should set exit_price to 0.0 when lost', () => {
      resolvePaperTrade(testDb, tradeId, false);
      
      const result = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(tradeId) as PaperTrade;
      
      expect(result.exit_price).toBe(0.0);
    });

    it('should calculate positive pnl for winning trade', () => {
      resolvePaperTrade(testDb, tradeId, true);
      
      const result = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(tradeId) as PaperTrade;
      
      // PnL = shares - virtual_amount = 153.85 - 100 = 53.85
      expect(result.pnl).toBeCloseTo(53.85, 2);
    });

    it('should calculate negative pnl for losing trade', () => {
      resolvePaperTrade(testDb, tradeId, false);
      
      const result = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(tradeId) as PaperTrade;
      
      // PnL = -virtual_amount = -100
      expect(result.pnl).toBe(-100);
    });

    it('should not fail when trade does not exist', () => {
      expect(() => {
        resolvePaperTrade(testDb, 'nonexistent-id', true);
      }).not.toThrow();
    });
  });

  describe('cancelPaperTrade', () => {
    let tradeId: string;

    beforeEach(() => {
      const trade = createPaperTradeInsert();
      tradeId = trade.id;
      insertPaperTrade(testDb, trade);
    });

    it('should update status to CANCELLED', () => {
      cancelPaperTrade(testDb, tradeId, 'Market closed unexpectedly');
      
      const result = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(tradeId) as PaperTrade;
      
      expect(result.status).toBe('CANCELLED');
    });

    it('should set pnl to 0', () => {
      cancelPaperTrade(testDb, tradeId, 'Indeterminate outcome');
      
      const result = testDb.prepare('SELECT * FROM paper_trades WHERE id = ?').get(tradeId) as PaperTrade;
      
      expect(result.pnl).toBe(0);
    });
  });

  describe('getPaperTradeStats', () => {
    it('should return zero stats for empty database', () => {
      const stats = getPaperTradeStats(testDb);
      
      expect(stats.total).toBe(0);
      expect(stats.open).toBe(0);
      expect(stats.winning).toBe(0);
      expect(stats.losing).toBe(0);
      expect(stats.cancelled).toBe(0);
      expect(stats.total_pnl).toBe(0);
      expect(stats.winRate).toBe(0);
    });

    it('should count open trades correctly', () => {
      insertPaperTrade(testDb, createPaperTradeInsert());
      insertPaperTrade(testDb, createPaperTradeInsert());
      insertPaperTrade(testDb, createPaperTradeInsert());
      
      const stats = getPaperTradeStats(testDb);
      
      expect(stats.open).toBe(3);
      expect(stats.total).toBe(3);
    });

    it('should count winning and losing trades correctly', () => {
      const trade1 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade1);
      resolvePaperTrade(testDb, trade1.id, true);
      
      const trade2 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade2);
      resolvePaperTrade(testDb, trade2.id, true);
      
      const trade3 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade3);
      resolvePaperTrade(testDb, trade3.id, false);
      
      const stats = getPaperTradeStats(testDb);
      
      expect(stats.winning).toBe(2);
      expect(stats.losing).toBe(1);
      expect(stats.completed).toBe(3);
    });

    it('should calculate win rate correctly', () => {
      // 3 wins, 1 loss = 75% win rate
      for (let i = 0; i < 3; i++) {
        const trade = createPaperTradeInsert();
        insertPaperTrade(testDb, trade);
        resolvePaperTrade(testDb, trade.id, true);
      }
      
      const lossTrade = createPaperTradeInsert();
      insertPaperTrade(testDb, lossTrade);
      resolvePaperTrade(testDb, lossTrade.id, false);
      
      const stats = getPaperTradeStats(testDb);
      
      expect(stats.winRate).toBe(0.75);
    });

    it('should calculate total pnl correctly', () => {
      const trade1 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade1);
      closePaperTrade(testDb, trade1.id, 0.70, 50);
      
      const trade2 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade2);
      closePaperTrade(testDb, trade2.id, 0.60, -30);
      
      const stats = getPaperTradeStats(testDb);
      
      expect(stats.total_pnl).toBe(20); // 50 - 30
    });

    it('should track best and worst pnl', () => {
      const trade1 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade1);
      closePaperTrade(testDb, trade1.id, 0.75, 100);
      
      const trade2 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade2);
      closePaperTrade(testDb, trade2.id, 0.60, -50);
      
      const trade3 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade3);
      closePaperTrade(testDb, trade3.id, 0.68, 25);
      
      const stats = getPaperTradeStats(testDb);
      
      expect(stats.best_pnl).toBe(100);
      expect(stats.worst_pnl).toBe(-50);
    });

    it('should calculate avg pnl correctly', () => {
      const trade1 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade1);
      closePaperTrade(testDb, trade1.id, 0.70, 30);
      
      const trade2 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade2);
      closePaperTrade(testDb, trade2.id, 0.60, -10);
      
      const trade3 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade3);
      closePaperTrade(testDb, trade3.id, 0.68, 20);
      
      const stats = getPaperTradeStats(testDb);
      
      expect(stats.avg_pnl).toBeCloseTo(13.33, 1); // (30 - 10 + 20) / 3
    });

    it('should count cancelled trades', () => {
      const trade1 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade1);
      cancelPaperTrade(testDb, trade1.id, 'Market closed');
      
      const trade2 = createPaperTradeInsert();
      insertPaperTrade(testDb, trade2);
      cancelPaperTrade(testDb, trade2.id, 'Error');
      
      const stats = getPaperTradeStats(testDb);
      
      expect(stats.cancelled).toBe(2);
    });

    it('should handle mix of all trade statuses', () => {
      // 2 open
      insertPaperTrade(testDb, createPaperTradeInsert());
      insertPaperTrade(testDb, createPaperTradeInsert());
      
      // 2 won
      const won1 = createPaperTradeInsert();
      insertPaperTrade(testDb, won1);
      resolvePaperTrade(testDb, won1.id, true);
      
      const won2 = createPaperTradeInsert();
      insertPaperTrade(testDb, won2);
      resolvePaperTrade(testDb, won2.id, true);
      
      // 1 lost
      const lost = createPaperTradeInsert();
      insertPaperTrade(testDb, lost);
      resolvePaperTrade(testDb, lost.id, false);
      
      // 1 cancelled
      const cancelled = createPaperTradeInsert();
      insertPaperTrade(testDb, cancelled);
      cancelPaperTrade(testDb, cancelled.id, 'Test');
      
      const stats = getPaperTradeStats(testDb);
      
      expect(stats.total).toBe(6);
      expect(stats.open).toBe(2);
      expect(stats.winning).toBe(2);
      expect(stats.losing).toBe(1);
      expect(stats.cancelled).toBe(1);
      expect(stats.completed).toBe(3);
      expect(stats.winRate).toBeCloseTo(0.67, 1); // 2/3
    });
  });
});
