import Database from 'better-sqlite3';
import { logger } from '../../src/utils/logger.js';

/**
 * Create an in-memory test database
 * This provides a clean database for each test
 */
export function createTestDatabase(): Database.Database {
  // Use in-memory database for tests
  const db = new Database(':memory:');
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Initialize schema
  initializeTestSchema(db);
  
  return db;
}

/**
 * Initialize test database schema
 * Matches production schema from src/models/database.ts
 */
function initializeTestSchema(db: Database.Database): void {
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

  // Wallet trades table
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

  // Indexes on wallet_trades
  db.exec(`CREATE INDEX IF NOT EXISTS idx_wallet_trades_address ON wallet_trades(wallet_address);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_wallet_trades_market ON wallet_trades(market_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_wallet_trades_archived ON wallet_trades(archived);`);

  // Paper trades table
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
      detected_at DATETIME,
      status TEXT DEFAULT 'OPEN',
      exit_price REAL,
      pnl REAL,
      confidence_score REAL,
      FOREIGN KEY (triggered_by) REFERENCES wallets(address)
    );
  `);

  // Indexes on paper_trades
  db.exec(`CREATE INDEX IF NOT EXISTS idx_paper_trades_status ON paper_trades(status);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_paper_trades_market ON paper_trades(market_id);`);

  // Real trades table
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

  // Indexes on real_trades
  db.exec(`CREATE INDEX IF NOT EXISTS idx_real_trades_status ON real_trades(status);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_real_trades_market ON real_trades(market_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_real_trades_order_id ON real_trades(order_id);`);

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

  // Market cache table
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
}

/**
 * Clear all data from test database
 */
export function clearTestDatabase(db: Database.Database): void {
  // Delete in order to respect foreign key constraints
  db.prepare('DELETE FROM performance').run();
  db.prepare('DELETE FROM market_cache').run();
  db.prepare('DELETE FROM real_trades').run();
  db.prepare('DELETE FROM paper_trades').run();
  db.prepare('DELETE FROM wallet_trades').run();
  db.prepare('DELETE FROM wallets').run();
}

/**
 * Get test database stats
 */
export function getTestDatabaseStats(db: Database.Database) {
  const stats = {
    wallets: db.prepare('SELECT COUNT(*) as count FROM wallets').get() as { count: number },
    walletTrades: db.prepare('SELECT COUNT(*) as count FROM wallet_trades').get() as { count: number },
    paperTrades: db.prepare('SELECT COUNT(*) as count FROM paper_trades').get() as { count: number },
    realTrades: db.prepare('SELECT COUNT(*) as count FROM real_trades').get() as { count: number },
  };

  return {
    totalWallets: stats.wallets.count,
    totalWalletTrades: stats.walletTrades.count,
    totalPaperTrades: stats.paperTrades.count,
    totalRealTrades: stats.realTrades.count,
  };
}

/**
 * Mock database instance for tests
 * Create a new instance for each test to ensure isolation
 */
let mockDb: Database.Database | null = null;

export function getMockDatabase(): Database.Database {
  if (!mockDb) {
    mockDb = createTestDatabase();
  }
  return mockDb;
}

export function resetMockDatabase(): void {
  if (mockDb) {
    mockDb.close();
    mockDb = null;
  }
  mockDb = createTestDatabase();
}

export function closeMockDatabase(): void {
  if (mockDb) {
    mockDb.close();
    mockDb = null;
  }
}
