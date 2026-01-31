
import { CONFIG } from '../src/config/settings.js';
import { setRuntimeConfigValues, getRuntimeConfig } from '../src/models/config.js';
import { db } from '../src/models/database.js';

// List of settings to migrate from Env/Defaults to Database
const SETTINGS_TO_MIGRATE = [
  // Whale Detection
  'WHALE_THRESHOLD_USD',
  'NEW_WALLET_HOURS',
  
  // Rating & Strategy
  'MIN_CONFIDENCE_FOR_TRADE',
  
  // Paper Trading
  'INITIAL_PAPER_BALANCE',
  'MAX_POSITION_SIZE_PERCENT',
  
  // Kelly Criterion
  'KELLY_FRACTION',
  'MIN_TRADE_AMOUNT_USD',
  'MAX_KELLY_BET_PERCENT',
  
  // Limits
  'MAX_OPEN_POSITIONS',
  'MAX_LOCKED_CAPITAL_PERCENT',
  'LOW_BALANCE_WARNING_PERCENT',
  
  // Real Trading
  'TRADING_MODE',
  'REAL_TRADING_SIGNATURE_TYPE',
  'REAL_TRADING_CHAIN_ID',
  'REAL_TRADING_MAX_POSITION_USD',
  'REAL_TRADING_DAILY_LIMIT_USD',
  'REAL_TRADING_START_HOUR',
  'REAL_TRADING_END_HOUR',
  'REAL_TRADING_KILL_SWITCH_ENABLED',
  'REAL_TRADING_MIN_SHARES',
  'REAL_TRADING_MAX_SLIPPAGE_PERCENT',
  'REAL_TRADING_CONFIRMATION_DELAY_MS',
  'REAL_TRADING_DRY_RUN',
  'ORDER_TIMEOUT_SECONDS',
  
  // Polling
  'TRADE_POLL_INTERVAL_MS',
  'ORDER_STATUS_POLL_INTERVAL',
  'RESOLUTION_CHECK_INTERVAL_MS',
  
  // WebSocket
  'USE_WEBSOCKET',
  'WS_RECONNECT_DELAY_MS',
  'WS_MAX_RECONNECT_ATTEMPTS',
  'WS_PING_INTERVAL_MS',
  
  // Features
  'TELEGRAM_ENABLED',
  'DASHBOARD_ENABLED',
  'DASHBOARD_PORT',
  
  // Logic
  'MARKET_AGE_THRESHOLD_DAYS',
  'MARK_OLD_AS_ARCHIVED'
];

async function seedSettings() {
  console.log('Starting settings migration...');
  
  // Ensure DB table exists (it should if app ran, but let's be safe)
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  const updates: Record<string, string> = {};
  
  for (const key of SETTINGS_TO_MIGRATE) {
    // Access CONFIG dynamically
    // @ts-ignore
    const value = CONFIG[key];
    
    if (value !== undefined) {
      // Convert to string for DB storage
      const stringValue = String(value);
      updates[key] = stringValue;
      console.log(`Prepared ${key} = ${stringValue}`);
    } else {
      console.warn(`Warning: Key ${key} not found in CONFIG`);
    }
  }
  
  if (Object.keys(updates).length > 0) {
    console.log(`\nSeeding ${Object.keys(updates).length} settings to database...`);
    setRuntimeConfigValues(updates);
    console.log('Database updated successfully.');
  } else {
    console.log('No settings to update.');
  }
  
  // Verify
  const newConfig = getRuntimeConfig();
  console.log('\n--- Current Database Configuration ---');
  console.table(newConfig);
}

seedSettings().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
