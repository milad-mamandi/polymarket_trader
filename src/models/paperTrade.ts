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
  status: 'OPEN' | 'CLOSED' | 'RESOLVED';
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
      entry_price, virtual_amount, shares, confidence_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  const stmt = db.prepare(`
    UPDATE paper_trades 
    SET status = 'RESOLVED', exit_price = ?, pnl = ?
    WHERE id = ?
  `);
  stmt.run(exitPrice, pnl, tradeId);
}

/**
 * Get paper trade statistics
 */
export function getPaperTradeStats() {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning,
      SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losing,
      SUM(COALESCE(pnl, 0)) as total_pnl,
      AVG(COALESCE(pnl, 0)) as avg_pnl,
      MAX(COALESCE(pnl, 0)) as best_pnl,
      MIN(COALESCE(pnl, 0)) as worst_pnl
    FROM paper_trades
  `).get() as {
    total: number;
    open: number;
    winning: number;
    losing: number;
    total_pnl: number;
    avg_pnl: number;
    best_pnl: number;
    worst_pnl: number;
  };

  const completed = stats.total - stats.open;
  const winRate = completed > 0 ? stats.winning / completed : 0;

  return {
    ...stats,
    completed,
    winRate,
  };
}
