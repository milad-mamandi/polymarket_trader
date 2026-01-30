import { db } from './database.js';

export interface RealTrade {
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

export interface RealTradeInsert {
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

/**
 * Insert a new real trade
 */
export function insertRealTrade(trade: RealTradeInsert): void {
  const stmt = db.prepare(`
    INSERT INTO real_trades (
      id, triggered_by, market_id, token_id, market_title, outcome, 
      order_type, entry_price, amount_usd, shares, confidence_score, status, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
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
    trade.confidence_score,
    new Date().toISOString()
  );
}

/**
 * Update real trade with order details after placement
 */
export function updateRealTradeOrder(
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

/**
 * Mark real trade as failed
 */
export function markRealTradeFailed(tradeId: string): void {
  const stmt = db.prepare(`
    UPDATE real_trades 
    SET status = 'FAILED'
    WHERE id = ?
  `);
  stmt.run(tradeId);
}

/**
 * Get all open real trades
 */
export function getOpenRealTrades(): RealTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM real_trades 
    WHERE status = 'OPEN'
    ORDER BY timestamp DESC
  `);
  return stmt.all() as RealTrade[];
}

/**
 * Get all real trades
 */
export function getAllRealTrades(limit = 100): RealTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM real_trades 
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(limit) as RealTrade[];
}

/**
 * Get a single real trade by ID
 */
export function getRealTradeById(tradeId: string): RealTrade | undefined {
  const stmt = db.prepare('SELECT * FROM real_trades WHERE id = ?');
  return stmt.get(tradeId) as RealTrade | undefined;
}

/**
 * Close a real trade
 */
export function closeRealTrade(
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

/**
 * Resolve a real trade (when market resolves)
 */
export function resolveRealTrade(tradeId: string, won: boolean): void {
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

/**
 * Cancel a real trade
 */
export function cancelRealTrade(tradeId: string): void {
  const stmt = db.prepare(`
    UPDATE real_trades 
    SET status = 'CANCELLED', pnl = 0
    WHERE id = ?
  `);
  stmt.run(tradeId);
}

/**
 * Get real trade statistics
 */
export function getRealTradeStats() {
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

/**
 * Get total amount spent today (for daily limit check)
 */
export function getTodaySpending(): number {
  const today = new Date().toISOString().split('T')[0];
  
  const result = db.prepare(`
    SELECT SUM(amount_usd) as total
    FROM real_trades
    WHERE DATE(timestamp) = ? AND status != 'FAILED' AND status != 'CANCELLED'
  `).get(today) as { total: number | null } | undefined;

  return result?.total ?? 0;
}

/**
 * Get total amount in open positions
 * @returns Sum of amount_usd for all OPEN trades
 */
export function getOpenPositionsTotalAmount(): number {
  const result = db.prepare(`
    SELECT SUM(amount_usd) as total
    FROM real_trades
    WHERE status = 'OPEN'
  `).get() as { total: number | null } | undefined;
  
  return result?.total ?? 0;
}
