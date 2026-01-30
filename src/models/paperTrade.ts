import { db } from './database.js';

export interface PaperTrade {
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

export interface PaperTradeInsert {
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

/**
 * Insert a new paper trade
 */
export function insertPaperTrade(trade: PaperTradeInsert): void {
  const stmt = db.prepare(`
    INSERT INTO paper_trades (
      id, triggered_by, market_id, market_title, outcome, 
      entry_price, virtual_amount, shares, confidence_score, detected_at, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  
  stmt.run(
    trade.id,
    trade.triggered_by,
    trade.market_id,
    trade.market_title,
    trade.outcome,
    trade.entry_price,
    trade.virtual_amount,
    trade.shares,
    trade.confidence_score,
    now,
    now
  );
}

/**
 * Get all open paper trades
 */
export function getOpenPaperTrades(): PaperTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM paper_trades 
    WHERE status = 'OPEN'
    ORDER BY timestamp DESC
  `);
  return stmt.all() as PaperTrade[];
}

/**
 * Get all paper trades
 */
export function getAllPaperTrades(limit = 100): PaperTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM paper_trades 
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(limit) as PaperTrade[];
}

/**
 * Get a single paper trade by ID
 */
export function getPaperTradeById(tradeId: string): PaperTrade | undefined {
  const stmt = db.prepare('SELECT * FROM paper_trades WHERE id = ?');
  return stmt.get(tradeId) as PaperTrade | undefined;
}

/**
 * Close a paper trade
 */
export function closePaperTrade(tradeId: string, exitPrice: number, pnl: number): void {
  const stmt = db.prepare(`
    UPDATE paper_trades 
    SET status = 'CLOSED', exit_price = ?, pnl = ?
    WHERE id = ?
  `);
  stmt.run(exitPrice, pnl, tradeId);
}

/**
 * Resolve a paper trade (when market resolves)
 */
export function resolvePaperTrade(tradeId: string, won: boolean): void {
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

/**
 * Cancel a paper trade (when outcome is indeterminate)
 * Returns the virtual amount to the balance
 */
export function cancelPaperTrade(tradeId: string, reason: string): void {
  const stmt = db.prepare(`
    UPDATE paper_trades 
    SET status = 'CANCELLED', pnl = 0
    WHERE id = ?
  `);
  stmt.run(tradeId);
}

/**
 * Get paper trade statistics
 */
export function getPaperTradeStats() {
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

  // Handle empty database or null values with nullish coalescing
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

/**
 * Get total amount in open positions
 * @returns Sum of virtual_amount for all OPEN trades
 */
export function getOpenPositionsTotalAmount(): number {
  const result = db.prepare(`
    SELECT SUM(virtual_amount) as total
    FROM paper_trades
    WHERE status = 'OPEN'
  `).get() as { total: number | null } | undefined;
  
  return result?.total ?? 0;
}
