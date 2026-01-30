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

  // Real trades table (actual on-chain trades)
  db.exec(`
    CREATE TABLE IF NOT EXISTS real_trades (
      id TEXT PRIMARY KEY,
      triggered_by TEXT NOT NULL,
      market_id TEXT NOT NULL,
      token_id TEXT NOT NULL,
      market_title TEXT,
      outcome TEXT,
      order_id TEXT,
      order_type TEXT,
      entry_price REAL,
      amount_usd REAL,
      shares REAL,
      fee_paid REAL,
      transaction_hash TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'OPEN',
      exit_price REAL,
      exit_order_id TEXT,
      exit_transaction_hash TEXT,
      pnl REAL,
      confidence_score REAL,
      FOREIGN KEY (triggered_by) REFERENCES wallets(address)
    );
  `);

  // Create index on real_trades
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_real_trades_status 
    ON real_trades(status);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_real_trades_market 
    ON real_trades(market_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_real_trades_order_id 
    ON real_trades(order_id);
  `);

  // Migration: Add detected_at column to paper_trades if it doesn't exist
  try {
    const tableInfo = db.pragma('table_info(paper_trades)') as Array<{ name: string }>;
    const hasDetectedAt = tableInfo.some(col => col.name === 'detected_at');
    
    if (!hasDetectedAt) {
      // Note: SQLite doesn't allow non-constant defaults in ALTER TABLE
      // New rows will get timestamp from insertPaperTrade(), existing rows get NULL
      db.exec('ALTER TABLE paper_trades ADD COLUMN detected_at DATETIME');
      logger.info('Migration: Added detected_at column to paper_trades table');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Migration error for detected_at: ${errorMessage}`);
  }

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
    openPaperTrades: db.prepare("SELECT COUNT(*) as count FROM paper_trades WHERE status = 'OPEN'").get() as { count: number },
    realTrades: db.prepare('SELECT COUNT(*) as count FROM real_trades').get() as { count: number },
    openRealTrades: db.prepare("SELECT COUNT(*) as count FROM real_trades WHERE status = 'OPEN'").get() as { count: number },
  };

  return {
    totalWallets: stats.wallets.count,
    totalWalletTrades: stats.walletTrades.count,
    totalPaperTrades: stats.paperTrades.count,
    openPaperTrades: stats.openPaperTrades.count,
    totalRealTrades: stats.realTrades.count,
    openRealTrades: stats.openRealTrades.count,
  };
}

/**
 * Clear old cached data
 */
export function clearOldCache(hoursOld = 24): void {
  const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM market_cache WHERE cached_at < ?').run(cutoff);
}

/**
 * Reset all trading data (paper trades and performance history)
 * Preserves detected wallets and their trades for reference
 */
export function resetTradingData(): void {
  logger.info('Resetting trading data...');
  
  try {
    // Delete all paper trades
    const paperTradesDeleted = db.prepare('DELETE FROM paper_trades').run();
    logger.info(`Deleted ${paperTradesDeleted.changes} paper trades`);
    
    // Delete all real trades
    const realTradesDeleted = db.prepare('DELETE FROM real_trades').run();
    logger.info(`Deleted ${realTradesDeleted.changes} real trades`);
    
    // Delete all performance history
    const performanceDeleted = db.prepare('DELETE FROM performance').run();
    logger.info(`Deleted ${performanceDeleted.changes} performance records`);
    
    logger.info('Trading data reset successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to reset trading data: ${errorMessage}`);
    throw error;
  }
}
