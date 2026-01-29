import { db } from './database.js';

export interface Wallet {
  address: string;
  first_seen: string;
  wallet_created_at?: string;
  is_whale: boolean;
  is_new_suspicious: boolean;
  total_volume: number;
  win_count: number;
  loss_count: number;
  suspicion_score: number;
  last_updated: string;
}

export interface WalletInsert {
  address: string;
  wallet_created_at?: string;
  is_whale: boolean;
  is_new_suspicious: boolean;
  total_volume: number;
  suspicion_score: number;
}

/**
 * Insert or update a wallet
 */
export function upsertWallet(wallet: WalletInsert): void {
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

/**
 * Get a wallet by address
 */
export function getWallet(address: string): Wallet | undefined {
  const stmt = db.prepare('SELECT * FROM wallets WHERE address = ?');
  return stmt.get(address) as Wallet | undefined;
}

/**
 * Get all watched wallets
 */
export function getAllWatchedWallets(): Wallet[] {
  const stmt = db.prepare(`
    SELECT * FROM wallets 
    WHERE is_whale = 1 OR is_new_suspicious = 1
    ORDER BY suspicion_score DESC, last_updated DESC
  `);
  return stmt.all() as Wallet[];
}

/**
 * Get top wallets by suspicion score
 */
export function getTopWallets(limit = 10): Wallet[] {
  const stmt = db.prepare(`
    SELECT * FROM wallets 
    WHERE is_whale = 1 OR is_new_suspicious = 1
    ORDER BY suspicion_score DESC
    LIMIT ?
  `);
  return stmt.all(limit) as Wallet[];
}

/**
 * Update wallet win/loss record
 */
export function updateWalletRecord(address: string, won: boolean): void {
  const field = won ? 'win_count' : 'loss_count';
  const stmt = db.prepare(`
    UPDATE wallets 
    SET ${field} = ${field} + 1, last_updated = CURRENT_TIMESTAMP
    WHERE address = ?
  `);
  stmt.run(address);
}

/**
 * Get wallet stats
 */
export function getWalletStats(address: string) {
  const wallet = getWallet(address);
  if (!wallet) return null;

  const totalTrades = wallet.win_count + wallet.loss_count;
  const winRate = totalTrades > 0 ? wallet.win_count / totalTrades : 0;

  return {
    ...wallet,
    totalTrades,
    winRate,
  };
}
