import { db } from './database.js';

export interface WalletTrade {
  id: string;
  wallet_address: string;
  market_id: string;
  market_title: string;
  outcome: string;
  side: string;
  size: number;
  price: number;
  timestamp: string;
  resolved: boolean;
  won?: boolean;
  archived?: boolean;
  archive_reason?: string;
}

/**
 * Insert a wallet trade
 */
export function insertWalletTrade(trade: Omit<WalletTrade, 'timestamp' | 'resolved'>): void {
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

/**
 * Get trades for a wallet
 */
export function getWalletTrades(walletAddress: string, limit = 50): WalletTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM wallet_trades 
    WHERE wallet_address = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(walletAddress, limit) as WalletTrade[];
}

/**
 * Get recent trades across all watched wallets
 */
export function getRecentWalletTrades(limit = 20): WalletTrade[] {
  const stmt = db.prepare(`
    SELECT wt.* FROM wallet_trades wt
    INNER JOIN wallets w ON wt.wallet_address = w.address
    WHERE w.is_whale = 1 OR w.is_new_suspicious = 1
    ORDER BY wt.timestamp DESC
    LIMIT ?
  `);
  return stmt.all(limit) as WalletTrade[];
}

/**
 * Get all trades for a specific market (for consensus checking)
 */
export function getWalletTradesForMarket(marketId: string): WalletTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM wallet_trades 
    WHERE market_id = ?
    ORDER BY timestamp DESC
  `);
  return stmt.all(marketId) as WalletTrade[];
}

/**
 * Get unresolved trades for resolution checking (excludes archived)
 */
export function getUnresolvedTrades(): WalletTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM wallet_trades 
    WHERE resolved = 0 AND archived = 0
    ORDER BY timestamp DESC
  `);
  return stmt.all() as WalletTrade[];
}

/**
 * Mark a trade as resolved
 */
export function resolveWalletTrade(tradeId: string, won: boolean): void {
  const stmt = db.prepare(`
    UPDATE wallet_trades 
    SET resolved = 1, won = ?
    WHERE id = ?
  `);
  stmt.run(won ? 1 : 0, tradeId);
}

/**
 * Mark a trade as archived (market no longer available)
 */
export function markTradeAsArchived(tradeId: string, reason: string): void {
  const stmt = db.prepare(`
    UPDATE wallet_trades 
    SET archived = 1, archive_reason = ?
    WHERE id = ?
  `);
  stmt.run(reason, tradeId);
}

/**
 * Get archived trades with their reasons
 */
export function getArchivedTrades(limit = 100): WalletTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM wallet_trades 
    WHERE archived = 1
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(limit) as WalletTrade[];
}

/**
 * Get archived trades summary
 */
export function getArchivedTradesSummary() {
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

/**
 * Get age of a trade in days
 */
export function getTradeAge(trade: WalletTrade): number {
  const tradeDate = new Date(trade.timestamp);
  const now = new Date();
  const diffMs = now.getTime() - tradeDate.getTime();
  return diffMs / (1000 * 60 * 60 * 24); // Convert to days
}
