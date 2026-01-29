import Database from 'better-sqlite3';
import { CONFIG } from '../config/settings.js';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

// Ensure data directory exists
if (!fs.existsSync(CONFIG.DATA_DIR)) {
  fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
}

const dbPath = path.join(CONFIG.DATA_DIR, 'whale_bot.db');
export const db: Database.Database = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

/**
 * Initialize database with schema
 */
export function initializeDatabase(): void {
  logger.info('Initializing database...');

  // Wallets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
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

  // Wallet trades table (track their actual trades)
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_trades (
      id TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      market_id TEXT NOT NULL,
      market_title TEXT,
      outcome TEXT,
      side TEXT,
      size REAL,
      price REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved BOOLEAN DEFAULT 0,
      won BOOLEAN,
      archived BOOLEAN DEFAULT 0,
      archive_reason TEXT,
      FOREIGN KEY (wallet_address) REFERENCES wallets(address)
    );
  `);

  // Create index on wallet_trades
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_wallet_trades_address 
    ON wallet_trades(wallet_address);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_wallet_trades_market 
    ON wallet_trades(market_id);
  `);

  // Migration: Add archived columns if they don't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE wallet_trades ADD COLUMN archived BOOLEAN DEFAULT 0;`);
    logger.info('Added archived column to wallet_trades table');
  } catch (error) {
    // Column already exists, ignore error
  }
  
  try {
    db.exec(`ALTER TABLE wallet_trades ADD COLUMN archive_reason TEXT;`);
    logger.info('Added archive_reason column to wallet_trades table');
  } catch (error) {
    // Column already exists, ignore error
  }

  // Create index on archived column (after migration)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_wallet_trades_archived 
    ON wallet_trades(archived);
  `);

  // Paper trades table (our simulated trades)
  db.exec(`
    CREATE TABLE IF NOT EXISTS paper_trades (
      id TEXT PRIMARY KEY,
      triggered_by TEXT NOT NULL,
      market_id TEXT NOT NULL,
      market_title TEXT,
      outcome TEXT,
      entry_price REAL,
      virtual_amount REAL,
      shares REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'OPEN',
      exit_price REAL,
      pnl REAL,
      confidence_score REAL,
      FOREIGN KEY (triggered_by) REFERENCES wallets(address)
    );
  `);

  // Create index on paper_trades
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_paper_trades_status 
    ON paper_trades(status);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_paper_trades_market 
    ON paper_trades(market_id);
  `);

  // Performance metrics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS performance (
      date DATE PRIMARY KEY,
      total_signals INTEGER DEFAULT 0,
      trades_executed INTEGER DEFAULT 0,
      winning_trades INTEGER DEFAULT 0,
      losing_trades INTEGER DEFAULT 0,
      total_pnl REAL DEFAULT 0,
      best_trade_pnl REAL DEFAULT 0,
      worst_trade_pnl REAL DEFAULT 0
    );
  `);

  // Market cache table (to avoid repeated API calls)
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_cache (
      condition_id TEXT PRIMARY KEY,
      title TEXT,
      slug TEXT,
      icon TEXT,
      event_slug TEXT,
      end_date TEXT,
      volume REAL,
      liquidity REAL,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  logger.info('Database initialized successfully');
}

/**
 * Get database stats
 */
export function getDatabaseStats() {
  const stats = {
    wallets: db.prepare('SELECT COUNT(*) as count FROM wallets').get() as { count: number },
    walletTrades: db.prepare('SELECT COUNT(*) as count FROM wallet_trades').get() as { count: number },
    paperTrades: db.prepare('SELECT COUNT(*) as count FROM paper_trades').get() as { count: number },
    openTrades: db.prepare("SELECT COUNT(*) as count FROM paper_trades WHERE status = 'OPEN'").get() as { count: number },
  };

  return {
    totalWallets: stats.wallets.count,
    totalWalletTrades: stats.walletTrades.count,
    totalPaperTrades: stats.paperTrades.count,
    openPaperTrades: stats.openTrades.count,
  };
}

/**
 * Clear old cached data
 */
export function clearOldCache(hoursOld = 24): void {
  const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM market_cache WHERE cached_at < ?').run(cutoff);
}
