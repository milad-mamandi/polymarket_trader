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
