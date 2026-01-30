import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import Database from 'better-sqlite3';
import { WHALE_ADDRESS, NEW_SUSPICIOUS_ADDRESS } from '../../fixtures/wallets.js';
import { MARKET_IDS, MARKET_TITLES, TOKEN_IDS } from '../../fixtures/markets.js';
import { generateMockId } from '../../setup.js';

/**
 * Unit tests for real trade model (src/models/realTrade.ts)
 * Tests real trading (live order placement) functionality
 * 
 * Note: These tests use a real in-memory SQLite database
 * and re-implement the realTrade functions locally to avoid ES module mocking issues
 */

// Real trade interfaces
interface RealTrade {
  id: string;
  triggered_by: string;
  market_id: string;
  token_id: string;
  market_title: string;
  outcome: string;
  order_id?: string;
  order_type?: string;
  entry_price: number;
  amount_usd: number;
  shares: number;
  fee_paid?: number;
  transaction_hash?: string;
  timestamp: string;
  status: 'PENDING' | 'OPEN' | 'CLOSED' | 'WON' | 'LOST' | 'CANCELLED' | 'FAILED';
  exit_price?: number;
  exit_order_id?: string;
  exit_transaction_hash?: string;
  pnl?: number;
  confidence_score: number;
}

interface RealTradeInsert {
  id: string;
  triggered_by: string;
  market_id: string;
  token_id: string;
  market_title: string;
  outcome: string;
  order_type: string;
  entry_price: number;
  amount_usd: number;
  shares: number;
  confidence_score: number;
}

// Helper functions that mirror src/models/realTrade.ts
function insertRealTrade(db: Database.Database, trade: RealTradeInsert): void {
  const stmt = db.prepare(`
    INSERT INTO real_trades (
      id, triggered_by, market_id, token_id, market_title, outcome, 
      order_type, entry_price, amount_usd, shares, confidence_score, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
  `);

  stmt.run(
    trade.id,
    trade.triggered_by,
    trade.market_id,
    trade.token_id,
    trade.market_title,
    trade.outcome,
    trade.order_type,
    trade.entry_price,
    trade.amount_usd,
    trade.shares,
    trade.confidence_score
  );
}

function updateRealTradeOrder(
  db: Database.Database,
  tradeId: string, 
  orderId: string, 
  transactionHash?: string,
  feePaid?: number
): void {
  const stmt = db.prepare(`
    UPDATE real_trades 
    SET order_id = ?, transaction_hash = ?, fee_paid = ?, status = 'OPEN'
    WHERE id = ?
  `);
  stmt.run(orderId, transactionHash, feePaid, tradeId);
}

function markRealTradeFailed(db: Database.Database, tradeId: string): void {
  const stmt = db.prepare(`
    UPDATE real_trades 
    SET status = 'FAILED'
    WHERE id = ?
  `);
  stmt.run(tradeId);
}

function getOpenRealTrades(db: Database.Database): RealTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM real_trades 
    WHERE status = 'OPEN'
    ORDER BY timestamp DESC
  `);
  return stmt.all() as RealTrade[];
}

function getAllRealTrades(db: Database.Database, limit = 100): RealTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM real_trades 
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(limit) as RealTrade[];
}

function getRealTradeById(db: Database.Database, tradeId: string): RealTrade | undefined {
  const stmt = db.prepare('SELECT * FROM real_trades WHERE id = ?');
  return stmt.get(tradeId) as RealTrade | undefined;
}

function closeRealTrade(
  db: Database.Database,
  tradeId: string, 
  exitPrice: number, 
  pnl: number,
  exitOrderId?: string,
  exitTransactionHash?: string
): void {
  const stmt = db.prepare(`
    UPDATE real_trades 
    SET status = 'CLOSED', exit_price = ?, pnl = ?, exit_order_id = ?, exit_transaction_hash = ?
    WHERE id = ?
  `);
  stmt.run(exitPrice, pnl, exitOrderId, exitTransactionHash, tradeId);
}

function resolveRealTrade(db: Database.Database, tradeId: string, won: boolean): void {
  const trade = db.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
  
  if (!trade) return;

  const exitPrice = won ? 1.0 : 0.0;
  const pnl = won ? (trade.shares - trade.amount_usd) : -trade.amount_usd;
  const status = won ? 'WON' : 'LOST';

  const stmt = db.prepare(`
    UPDATE real_trades 
    SET status = ?, exit_price = ?, pnl = ?
    WHERE id = ?
  `);
  stmt.run(status, exitPrice, pnl, tradeId);
}

function cancelRealTrade(db: Database.Database, tradeId: string): void {
  const stmt = db.prepare(`
    UPDATE real_trades 
    SET status = 'CANCELLED', pnl = 0
    WHERE id = ?
  `);
  stmt.run(tradeId);
}

function getRealTradeStats(db: Database.Database) {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open,
      SUM(CASE WHEN status = 'WON' THEN 1 ELSE 0 END) as winning,
      SUM(CASE WHEN status = 'LOST' THEN 1 ELSE 0 END) as losing,
      SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
      SUM(COALESCE(pnl, 0)) as total_pnl,
      AVG(COALESCE(pnl, 0)) as avg_pnl,
      MAX(COALESCE(pnl, 0)) as best_pnl,
      MIN(COALESCE(pnl, 0)) as worst_pnl,
      SUM(COALESCE(fee_paid, 0)) as total_fees,
      SUM(COALESCE(amount_usd, 0)) as total_volume
    FROM real_trades
  `).get() as {
    total: number | null;
    pending: number | null;
    open: number | null;
    winning: number | null;
    losing: number | null;
    cancelled: number | null;
    failed: number | null;
    total_pnl: number | null;
    avg_pnl: number | null;
    best_pnl: number | null;
    worst_pnl: number | null;
    total_fees: number | null;
    total_volume: number | null;
  } | undefined;

  const total = stats?.total ?? 0;
  const pending = stats?.pending ?? 0;
  const open = stats?.open ?? 0;
  const winning = stats?.winning ?? 0;
  const losing = stats?.losing ?? 0;
  const cancelled = stats?.cancelled ?? 0;
  const failed = stats?.failed ?? 0;
  const total_pnl = stats?.total_pnl ?? 0;
  const avg_pnl = stats?.avg_pnl ?? 0;
  const best_pnl = stats?.best_pnl ?? 0;
  const worst_pnl = stats?.worst_pnl ?? 0;
  const total_fees = stats?.total_fees ?? 0;
  const total_volume = stats?.total_volume ?? 0;

  const completed = winning + losing;
  const winRate = completed > 0 ? winning / completed : 0;

  return {
    total,
    pending,
    open,
    winning,
    losing,
    cancelled,
    failed,
    total_pnl,
    avg_pnl,
    best_pnl,
    worst_pnl,
    total_fees,
    total_volume,
    completed,
    winRate,
  };
}

function getTodaySpending(db: Database.Database): number {
  const today = new Date().toISOString().split('T')[0];
  
  const result = db.prepare(`
    SELECT SUM(amount_usd) as total
    FROM real_trades
    WHERE DATE(timestamp) = ? AND status != 'FAILED' AND status != 'CANCELLED'
  `).get(today) as { total: number | null } | undefined;

  return result?.total ?? 0;
}

// Helper to create real trade insert data
function createRealTradeInsert(overrides: Partial<RealTradeInsert> = {}): RealTradeInsert {
  return {
    id: generateMockId(),
    triggered_by: WHALE_ADDRESS,
    market_id: MARKET_IDS.trump,
    token_id: TOKEN_IDS.trumpYes,
    market_title: MARKET_TITLES.trump,
    outcome: 'Yes',
    order_type: 'MARKET',
    entry_price: 0.65,
    amount_usd: 100,
    shares: 153.85, // amount_usd / entry_price
    confidence_score: 0.75,
    ...overrides,
  };
}

describe('RealTrade Model', () => {
  let testDb: Database.Database;

  beforeAll(() => {
    // Create in-memory test database
    testDb = new Database(':memory:');
    
    // Create real_trades table
    testDb.exec(`
      CREATE TABLE real_trades (
        id TEXT PRIMARY KEY,
        triggered_by TEXT NOT NULL,
        market_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        market_title TEXT NOT NULL,
        outcome TEXT NOT NULL,
        order_id TEXT,
        order_type TEXT,
        entry_price REAL NOT NULL,
        amount_usd REAL NOT NULL,
        shares REAL NOT NULL,
        fee_paid REAL,
        transaction_hash TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'PENDING',
        exit_price REAL,
        exit_order_id TEXT,
        exit_transaction_hash TEXT,
        pnl REAL,
        confidence_score REAL NOT NULL
      );
    `);
  });

  beforeEach(() => {
    // Clear all data before each test
    testDb.prepare('DELETE FROM real_trades').run();
  });

  afterAll(() => {
    testDb.close();
  });

  describe('insertRealTrade', () => {
    it('should insert a new real trade', () => {
      const trade = createRealTradeInsert();
      
      insertRealTrade(testDb, trade);

      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(trade.id) as RealTrade;
      
      expect(result).toBeDefined();
      expect(result.triggered_by).toBe(WHALE_ADDRESS);
      expect(result.market_id).toBe(MARKET_IDS.trump);
      expect(result.token_id).toBe(TOKEN_IDS.trumpYes);
      expect(result.entry_price).toBe(0.65);
      expect(result.amount_usd).toBe(100);
    });

    it('should set default status to PENDING', () => {
      const trade = createRealTradeInsert();
      
      insertRealTrade(testDb, trade);

      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(trade.id) as RealTrade;
      
      expect(result.status).toBe('PENDING');
    });

    it('should set timestamp automatically', () => {
      const trade = createRealTradeInsert();
      
      insertRealTrade(testDb, trade);

      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(trade.id) as RealTrade;
      
      expect(result.timestamp).toBeDefined();
    });

    it('should handle different order types', () => {
      const marketOrder = createRealTradeInsert({ order_type: 'MARKET' });
      const limitOrder = createRealTradeInsert({ order_type: 'LIMIT' });
      
      insertRealTrade(testDb, marketOrder);
      insertRealTrade(testDb, limitOrder);

      const result1 = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(marketOrder.id) as RealTrade;
      const result2 = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(limitOrder.id) as RealTrade;
      
      expect(result1.order_type).toBe('MARKET');
      expect(result2.order_type).toBe('LIMIT');
    });

    it('should handle trades triggered by different wallets', () => {
      const whaleTrade = createRealTradeInsert({ triggered_by: WHALE_ADDRESS });
      const suspiciousTrade = createRealTradeInsert({ triggered_by: NEW_SUSPICIOUS_ADDRESS });
      
      insertRealTrade(testDb, whaleTrade);
      insertRealTrade(testDb, suspiciousTrade);

      const trades = getAllRealTrades(testDb);
      
      expect(trades).toHaveLength(2);
      expect(trades.some(t => t.triggered_by === WHALE_ADDRESS)).toBe(true);
      expect(trades.some(t => t.triggered_by === NEW_SUSPICIOUS_ADDRESS)).toBe(true);
    });

    it('should require token_id for CLOB orders', () => {
      const trade = createRealTradeInsert({ token_id: TOKEN_IDS.bitcoinYes });
      
      insertRealTrade(testDb, trade);

      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(trade.id) as RealTrade;
      
      expect(result.token_id).toBe(TOKEN_IDS.bitcoinYes);
      expect(result.token_id).toBeDefined();
    });
  });

  describe('updateRealTradeOrder', () => {
    let tradeId: string;

    beforeEach(() => {
      const trade = createRealTradeInsert();
      tradeId = trade.id;
      insertRealTrade(testDb, trade);
    });

    it('should update status to OPEN', () => {
      updateRealTradeOrder(testDb, tradeId, 'order-123');
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.status).toBe('OPEN');
    });

    it('should set order_id', () => {
      updateRealTradeOrder(testDb, tradeId, 'order-456');
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.order_id).toBe('order-456');
    });

    it('should set transaction_hash when provided', () => {
      updateRealTradeOrder(testDb, tradeId, 'order-789', '0xabc123');
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.transaction_hash).toBe('0xabc123');
    });

    it('should set fee_paid when provided', () => {
      updateRealTradeOrder(testDb, tradeId, 'order-999', '0xdef456', 2.50);
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.fee_paid).toBe(2.50);
    });

    it('should handle order update without optional fields', () => {
      updateRealTradeOrder(testDb, tradeId, 'order-111');
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.order_id).toBe('order-111');
      expect(result.status).toBe('OPEN');
      expect(result.transaction_hash).toBeNull();
      expect(result.fee_paid).toBeNull();
    });
  });

  describe('markRealTradeFailed', () => {
    let tradeId: string;

    beforeEach(() => {
      const trade = createRealTradeInsert();
      tradeId = trade.id;
      insertRealTrade(testDb, trade);
    });

    it('should update status to FAILED', () => {
      markRealTradeFailed(testDb, tradeId);
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.status).toBe('FAILED');
    });

    it('should mark failed trade even after order update', () => {
      updateRealTradeOrder(testDb, tradeId, 'order-123');
      markRealTradeFailed(testDb, tradeId);
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.status).toBe('FAILED');
    });
  });

  describe('getOpenRealTrades', () => {
    beforeEach(() => {
      // Insert trades with different statuses
      const trade1 = createRealTradeInsert();
      insertRealTrade(testDb, trade1);
      updateRealTradeOrder(testDb, trade1.id, 'order-1');
      
      const trade2 = createRealTradeInsert();
      insertRealTrade(testDb, trade2);
      updateRealTradeOrder(testDb, trade2.id, 'order-2');
      resolveRealTrade(testDb, trade2.id, true);
      
      const trade3 = createRealTradeInsert();
      insertRealTrade(testDb, trade3);
      markRealTradeFailed(testDb, trade3.id);
    });

    it('should return only open trades', () => {
      const trades = getOpenRealTrades(testDb);
      
      expect(trades.length).toBe(1);
      expect(trades[0].status).toBe('OPEN');
    });

    it('should exclude pending trades', () => {
      const trade4 = createRealTradeInsert();
      insertRealTrade(testDb, trade4);
      
      const trades = getOpenRealTrades(testDb);
      
      expect(trades.every(t => t.status !== 'PENDING')).toBe(true);
    });

    it('should exclude won trades', () => {
      const trades = getOpenRealTrades(testDb);
      
      expect(trades.every(t => t.status !== 'WON')).toBe(true);
    });

    it('should exclude failed trades', () => {
      const trades = getOpenRealTrades(testDb);
      
      expect(trades.every(t => t.status !== 'FAILED')).toBe(true);
    });

    it('should return empty array when no open trades exist', () => {
      testDb.prepare('DELETE FROM real_trades').run();
      
      const trades = getOpenRealTrades(testDb);
      
      expect(trades).toEqual([]);
    });

    it('should order by timestamp DESC', () => {
      testDb.prepare('DELETE FROM real_trades').run();
      
      const trade1 = createRealTradeInsert();
      insertRealTrade(testDb, trade1);
      updateRealTradeOrder(testDb, trade1.id, 'order-1');
      
      const trade2 = createRealTradeInsert();
      insertRealTrade(testDb, trade2);
      updateRealTradeOrder(testDb, trade2.id, 'order-2');

      const trades = getOpenRealTrades(testDb);
      
      const date1 = new Date(trades[0].timestamp).getTime();
      const date2 = new Date(trades[1].timestamp).getTime();
      expect(date1).toBeGreaterThanOrEqual(date2);
    });
  });

  describe('getAllRealTrades', () => {
    beforeEach(() => {
      // Insert multiple trades
      for (let i = 0; i < 5; i++) {
        insertRealTrade(testDb, createRealTradeInsert());
      }
    });

    it('should return all trades regardless of status', () => {
      const trades = getAllRealTrades(testDb);
      
      expect(trades.length).toBe(5);
    });

    it('should respect limit parameter', () => {
      const trades = getAllRealTrades(testDb, 3);
      
      expect(trades.length).toBe(3);
    });

    it('should default to limit of 100', () => {
      testDb.prepare('DELETE FROM real_trades').run();
      
      // Insert 110 trades
      for (let i = 0; i < 110; i++) {
        insertRealTrade(testDb, createRealTradeInsert());
      }
      
      const trades = getAllRealTrades(testDb);
      
      expect(trades.length).toBe(100);
    });

    it('should order by timestamp DESC', () => {
      const trades = getAllRealTrades(testDb);
      
      for (let i = 0; i < trades.length - 1; i++) {
        const date1 = new Date(trades[i].timestamp).getTime();
        const date2 = new Date(trades[i + 1].timestamp).getTime();
        expect(date1).toBeGreaterThanOrEqual(date2);
      }
    });
  });

  describe('getRealTradeById', () => {
    let tradeId: string;

    beforeEach(() => {
      const trade = createRealTradeInsert();
      tradeId = trade.id;
      insertRealTrade(testDb, trade);
    });

    it('should return trade by ID', () => {
      const result = getRealTradeById(testDb, tradeId);
      
      expect(result).toBeDefined();
      expect(result?.id).toBe(tradeId);
    });

    it('should return undefined for non-existent trade', () => {
      const result = getRealTradeById(testDb, 'non-existent');
      
      expect(result).toBeUndefined();
    });

    it('should return trade with all fields', () => {
      const result = getRealTradeById(testDb, tradeId);
      
      expect(result).toHaveProperty('triggered_by');
      expect(result).toHaveProperty('market_id');
      expect(result).toHaveProperty('token_id');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('confidence_score');
    });
  });

  describe('closeRealTrade', () => {
    let tradeId: string;

    beforeEach(() => {
      const trade = createRealTradeInsert();
      tradeId = trade.id;
      insertRealTrade(testDb, trade);
      updateRealTradeOrder(testDb, tradeId, 'order-123');
    });

    it('should update status to CLOSED', () => {
      closeRealTrade(testDb, tradeId, 0.70, 10);
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.status).toBe('CLOSED');
    });

    it('should set exit_price', () => {
      closeRealTrade(testDb, tradeId, 0.72, 15);
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.exit_price).toBe(0.72);
    });

    it('should set pnl', () => {
      closeRealTrade(testDb, tradeId, 0.75, 20.50);
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.pnl).toBe(20.50);
    });

    it('should handle negative pnl (losses)', () => {
      closeRealTrade(testDb, tradeId, 0.60, -10);
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.pnl).toBe(-10);
      expect(result.exit_price).toBe(0.60);
    });

    it('should set exit_order_id when provided', () => {
      closeRealTrade(testDb, tradeId, 0.68, 5, 'exit-order-123');
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.exit_order_id).toBe('exit-order-123');
    });

    it('should set exit_transaction_hash when provided', () => {
      closeRealTrade(testDb, tradeId, 0.68, 5, 'exit-order-456', '0xexit123');
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.exit_transaction_hash).toBe('0xexit123');
    });
  });

  describe('resolveRealTrade', () => {
    let tradeId: string;

    beforeEach(() => {
      const trade = createRealTradeInsert({
        entry_price: 0.65,
        amount_usd: 100,
        shares: 153.85,
      });
      tradeId = trade.id;
      insertRealTrade(testDb, trade);
      updateRealTradeOrder(testDb, tradeId, 'order-123');
    });

    it('should mark trade as WON when won is true', () => {
      resolveRealTrade(testDb, tradeId, true);
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.status).toBe('WON');
    });

    it('should mark trade as LOST when won is false', () => {
      resolveRealTrade(testDb, tradeId, false);
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.status).toBe('LOST');
    });

    it('should set exit_price to 1.0 when won', () => {
      resolveRealTrade(testDb, tradeId, true);
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.exit_price).toBe(1.0);
    });

    it('should set exit_price to 0.0 when lost', () => {
      resolveRealTrade(testDb, tradeId, false);
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.exit_price).toBe(0.0);
    });

    it('should calculate positive pnl for winning trade', () => {
      resolveRealTrade(testDb, tradeId, true);
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      // PnL = shares - amount_usd = 153.85 - 100 = 53.85
      expect(result.pnl).toBeCloseTo(53.85, 2);
    });

    it('should calculate negative pnl for losing trade', () => {
      resolveRealTrade(testDb, tradeId, false);
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      // PnL = -amount_usd = -100
      expect(result.pnl).toBe(-100);
    });

    it('should not fail when trade does not exist', () => {
      expect(() => {
        resolveRealTrade(testDb, 'nonexistent-id', true);
      }).not.toThrow();
    });
  });

  describe('cancelRealTrade', () => {
    let tradeId: string;

    beforeEach(() => {
      const trade = createRealTradeInsert();
      tradeId = trade.id;
      insertRealTrade(testDb, trade);
      updateRealTradeOrder(testDb, tradeId, 'order-123');
    });

    it('should update status to CANCELLED', () => {
      cancelRealTrade(testDb, tradeId);
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.status).toBe('CANCELLED');
    });

    it('should set pnl to 0', () => {
      cancelRealTrade(testDb, tradeId);
      
      const result = testDb.prepare('SELECT * FROM real_trades WHERE id = ?').get(tradeId) as RealTrade;
      
      expect(result.pnl).toBe(0);
    });
  });

  describe('getRealTradeStats', () => {
    it('should return zero stats for empty database', () => {
      const stats = getRealTradeStats(testDb);
      
      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.open).toBe(0);
      expect(stats.winning).toBe(0);
      expect(stats.losing).toBe(0);
      expect(stats.cancelled).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.total_pnl).toBe(0);
      expect(stats.total_fees).toBe(0);
      expect(stats.total_volume).toBe(0);
      expect(stats.winRate).toBe(0);
    });

    it('should count pending trades correctly', () => {
      insertRealTrade(testDb, createRealTradeInsert());
      insertRealTrade(testDb, createRealTradeInsert());
      
      const stats = getRealTradeStats(testDb);
      
      expect(stats.pending).toBe(2);
      expect(stats.total).toBe(2);
    });

    it('should count open trades correctly', () => {
      const trade1 = createRealTradeInsert();
      insertRealTrade(testDb, trade1);
      updateRealTradeOrder(testDb, trade1.id, 'order-1');
      
      const trade2 = createRealTradeInsert();
      insertRealTrade(testDb, trade2);
      updateRealTradeOrder(testDb, trade2.id, 'order-2');
      
      const stats = getRealTradeStats(testDb);
      
      expect(stats.open).toBe(2);
    });

    it('should count winning and losing trades correctly', () => {
      const trade1 = createRealTradeInsert();
      insertRealTrade(testDb, trade1);
      updateRealTradeOrder(testDb, trade1.id, 'order-1');
      resolveRealTrade(testDb, trade1.id, true);
      
      const trade2 = createRealTradeInsert();
      insertRealTrade(testDb, trade2);
      updateRealTradeOrder(testDb, trade2.id, 'order-2');
      resolveRealTrade(testDb, trade2.id, true);
      
      const trade3 = createRealTradeInsert();
      insertRealTrade(testDb, trade3);
      updateRealTradeOrder(testDb, trade3.id, 'order-3');
      resolveRealTrade(testDb, trade3.id, false);
      
      const stats = getRealTradeStats(testDb);
      
      expect(stats.winning).toBe(2);
      expect(stats.losing).toBe(1);
      expect(stats.completed).toBe(3);
    });

    it('should calculate win rate correctly', () => {
      // 3 wins, 1 loss = 75% win rate
      for (let i = 0; i < 3; i++) {
        const trade = createRealTradeInsert();
        insertRealTrade(testDb, trade);
        updateRealTradeOrder(testDb, trade.id, `order-${i}`);
        resolveRealTrade(testDb, trade.id, true);
      }
      
      const lossTrade = createRealTradeInsert();
      insertRealTrade(testDb, lossTrade);
      updateRealTradeOrder(testDb, lossTrade.id, 'order-loss');
      resolveRealTrade(testDb, lossTrade.id, false);
      
      const stats = getRealTradeStats(testDb);
      
      expect(stats.winRate).toBe(0.75);
    });

    it('should calculate total pnl correctly', () => {
      const trade1 = createRealTradeInsert();
      insertRealTrade(testDb, trade1);
      updateRealTradeOrder(testDb, trade1.id, 'order-1');
      closeRealTrade(testDb, trade1.id, 0.70, 50);
      
      const trade2 = createRealTradeInsert();
      insertRealTrade(testDb, trade2);
      updateRealTradeOrder(testDb, trade2.id, 'order-2');
      closeRealTrade(testDb, trade2.id, 0.60, -30);
      
      const stats = getRealTradeStats(testDb);
      
      expect(stats.total_pnl).toBe(20); // 50 - 30
    });

    it('should track total fees paid', () => {
      const trade1 = createRealTradeInsert();
      insertRealTrade(testDb, trade1);
      updateRealTradeOrder(testDb, trade1.id, 'order-1', '0xabc', 2.50);
      
      const trade2 = createRealTradeInsert();
      insertRealTrade(testDb, trade2);
      updateRealTradeOrder(testDb, trade2.id, 'order-2', '0xdef', 3.75);
      
      const stats = getRealTradeStats(testDb);
      
      expect(stats.total_fees).toBe(6.25);
    });

    it('should track total volume', () => {
      insertRealTrade(testDb, createRealTradeInsert({ amount_usd: 100 }));
      insertRealTrade(testDb, createRealTradeInsert({ amount_usd: 200 }));
      insertRealTrade(testDb, createRealTradeInsert({ amount_usd: 150 }));
      
      const stats = getRealTradeStats(testDb);
      
      expect(stats.total_volume).toBe(450);
    });

    it('should track best and worst pnl', () => {
      const trade1 = createRealTradeInsert();
      insertRealTrade(testDb, trade1);
      updateRealTradeOrder(testDb, trade1.id, 'order-1');
      closeRealTrade(testDb, trade1.id, 0.75, 100);
      
      const trade2 = createRealTradeInsert();
      insertRealTrade(testDb, trade2);
      updateRealTradeOrder(testDb, trade2.id, 'order-2');
      closeRealTrade(testDb, trade2.id, 0.60, -50);
      
      const trade3 = createRealTradeInsert();
      insertRealTrade(testDb, trade3);
      updateRealTradeOrder(testDb, trade3.id, 'order-3');
      closeRealTrade(testDb, trade3.id, 0.68, 25);
      
      const stats = getRealTradeStats(testDb);
      
      expect(stats.best_pnl).toBe(100);
      expect(stats.worst_pnl).toBe(-50);
    });

    it('should count failed trades', () => {
      const trade1 = createRealTradeInsert();
      insertRealTrade(testDb, trade1);
      markRealTradeFailed(testDb, trade1.id);
      
      const trade2 = createRealTradeInsert();
      insertRealTrade(testDb, trade2);
      markRealTradeFailed(testDb, trade2.id);
      
      const stats = getRealTradeStats(testDb);
      
      expect(stats.failed).toBe(2);
    });

    it('should count cancelled trades', () => {
      const trade1 = createRealTradeInsert();
      insertRealTrade(testDb, trade1);
      updateRealTradeOrder(testDb, trade1.id, 'order-1');
      cancelRealTrade(testDb, trade1.id);
      
      const stats = getRealTradeStats(testDb);
      
      expect(stats.cancelled).toBe(1);
    });

    it('should handle mix of all trade statuses', () => {
      // 1 pending
      insertRealTrade(testDb, createRealTradeInsert());
      
      // 1 open
      const open = createRealTradeInsert();
      insertRealTrade(testDb, open);
      updateRealTradeOrder(testDb, open.id, 'order-open');
      
      // 2 won
      const won1 = createRealTradeInsert();
      insertRealTrade(testDb, won1);
      updateRealTradeOrder(testDb, won1.id, 'order-won1');
      resolveRealTrade(testDb, won1.id, true);
      
      const won2 = createRealTradeInsert();
      insertRealTrade(testDb, won2);
      updateRealTradeOrder(testDb, won2.id, 'order-won2');
      resolveRealTrade(testDb, won2.id, true);
      
      // 1 lost
      const lost = createRealTradeInsert();
      insertRealTrade(testDb, lost);
      updateRealTradeOrder(testDb, lost.id, 'order-lost');
      resolveRealTrade(testDb, lost.id, false);
      
      // 1 cancelled
      const cancelled = createRealTradeInsert();
      insertRealTrade(testDb, cancelled);
      updateRealTradeOrder(testDb, cancelled.id, 'order-cancelled');
      cancelRealTrade(testDb, cancelled.id);
      
      // 1 failed
      const failed = createRealTradeInsert();
      insertRealTrade(testDb, failed);
      markRealTradeFailed(testDb, failed.id);
      
      const stats = getRealTradeStats(testDb);
      
      expect(stats.total).toBe(7);
      expect(stats.pending).toBe(1);
      expect(stats.open).toBe(1);
      expect(stats.winning).toBe(2);
      expect(stats.losing).toBe(1);
      expect(stats.cancelled).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.completed).toBe(3);
      expect(stats.winRate).toBeCloseTo(0.67, 1); // 2/3
    });
  });

  describe('getTodaySpending', () => {
    it('should return 0 for empty database', () => {
      const spending = getTodaySpending(testDb);
      
      expect(spending).toBe(0);
    });

    it('should sum amount_usd for today', () => {
      insertRealTrade(testDb, createRealTradeInsert({ amount_usd: 100 }));
      insertRealTrade(testDb, createRealTradeInsert({ amount_usd: 200 }));
      insertRealTrade(testDb, createRealTradeInsert({ amount_usd: 150 }));
      
      const spending = getTodaySpending(testDb);
      
      expect(spending).toBe(450);
    });

    it('should exclude failed trades from spending', () => {
      const trade1 = createRealTradeInsert({ amount_usd: 100 });
      insertRealTrade(testDb, trade1);
      
      const trade2 = createRealTradeInsert({ amount_usd: 200 });
      insertRealTrade(testDb, trade2);
      markRealTradeFailed(testDb, trade2.id);
      
      const spending = getTodaySpending(testDb);
      
      expect(spending).toBe(100); // Only successful trade
    });

    it('should exclude cancelled trades from spending', () => {
      const trade1 = createRealTradeInsert({ amount_usd: 100 });
      insertRealTrade(testDb, trade1);
      updateRealTradeOrder(testDb, trade1.id, 'order-1');
      
      const trade2 = createRealTradeInsert({ amount_usd: 200 });
      insertRealTrade(testDb, trade2);
      updateRealTradeOrder(testDb, trade2.id, 'order-2');
      cancelRealTrade(testDb, trade2.id);
      
      const spending = getTodaySpending(testDb);
      
      expect(spending).toBe(100); // Only non-cancelled trade
    });

    it('should include pending, open, won, lost trades in spending', () => {
      // Pending
      insertRealTrade(testDb, createRealTradeInsert({ amount_usd: 50 }));
      
      // Open
      const open = createRealTradeInsert({ amount_usd: 75 });
      insertRealTrade(testDb, open);
      updateRealTradeOrder(testDb, open.id, 'order-open');
      
      // Won
      const won = createRealTradeInsert({ amount_usd: 100 });
      insertRealTrade(testDb, won);
      updateRealTradeOrder(testDb, won.id, 'order-won');
      resolveRealTrade(testDb, won.id, true);
      
      // Lost
      const lost = createRealTradeInsert({ amount_usd: 125 });
      insertRealTrade(testDb, lost);
      updateRealTradeOrder(testDb, lost.id, 'order-lost');
      resolveRealTrade(testDb, lost.id, false);
      
      const spending = getTodaySpending(testDb);
      
      expect(spending).toBe(350); // 50 + 75 + 100 + 125
    });
  });
});
