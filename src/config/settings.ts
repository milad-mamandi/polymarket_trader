import dotenv from 'dotenv';
import crypto from 'crypto';
import { getRuntimeConfig } from '../models/config.js';
import { logger } from '../utils/logger.js';

dotenv.config();

/**
 * Generate a random secret key if not provided
 */
function generateRandomSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Load runtime overrides from database (for Docker deployments with read-only .env)
let runtimeConfig: Record<string, string> = {};

/**
 * Reload configuration from the database
 */
export function refreshConfig(): void {
  try {
    runtimeConfig = getRuntimeConfig();
    logger.info(`Configuration reloaded from database. Active overrides: ${Object.keys(runtimeConfig).length}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to reload configuration from database: ${errorMessage}`);
  }
}

// Initial load
try {
  runtimeConfig = getRuntimeConfig();
} catch (error) {
  // Database not initialized yet, will use .env values
}

// Helper to get config value from runtime DB (priority) or .env (fallback)
function getConfigString(key: string, envValue: string | undefined, defaultValue: string): string {
  if (runtimeConfig[key] !== undefined) {
    return runtimeConfig[key];
  }
  return envValue !== undefined ? envValue : defaultValue;
}

function getConfigNumber(key: string, envValue: string | undefined, defaultValue: number): number {
  if (runtimeConfig[key] !== undefined) {
    return Number(runtimeConfig[key]);
  }
  return envValue !== undefined ? Number(envValue) : defaultValue;
}

function getConfigBoolean(key: string, envValue: string | undefined, defaultValue: boolean): boolean {
  if (runtimeConfig[key] !== undefined) {
    return runtimeConfig[key] === 'true';
  }
  return envValue !== undefined ? envValue === 'true' : defaultValue;
}

export const CONFIG = {
  // Whale Detection - General
  get WHALE_THRESHOLD_USD() { return getConfigNumber('WHALE_THRESHOLD_USD', process.env.WHALE_THRESHOLD_USD, 50000); },
  get NEW_WALLET_HOURS() { return getConfigNumber('NEW_WALLET_HOURS', process.env.NEW_WALLET_HOURS, 24); },
  get TRADE_MAX_AGE_HOURS() { return getConfigNumber('TRADE_MAX_AGE_HOURS', process.env.TRADE_MAX_AGE_HOURS, 2); },
  get ACTIVE_MARKETS_COUNT() { return getConfigNumber('ACTIVE_MARKETS_COUNT', process.env.ACTIVE_MARKETS_COUNT, 50); },
  get MIN_MARKET_HOURS_REMAINING() { return getConfigNumber('MIN_MARKET_HOURS_REMAINING', process.env.MIN_MARKET_HOURS_REMAINING, 24); },
  
  // Short-Term Strategy (sports, daily events - higher risk, faster turnover)
  get SHORT_TERM_ENABLED() { return getConfigBoolean('SHORT_TERM_ENABLED', process.env.SHORT_TERM_ENABLED, true); },
  get SHORT_TERM_MIN_HOURS() { return getConfigNumber('SHORT_TERM_MIN_HOURS', process.env.SHORT_TERM_MIN_HOURS, 1); },  // Min 1h to resolution
  get SHORT_TERM_MAX_HOURS() { return getConfigNumber('SHORT_TERM_MAX_HOURS', process.env.SHORT_TERM_MAX_HOURS, 72); }, // Max 72h to resolution (extended from 48)
  get SHORT_TERM_MIN_TRADE_USD() { return getConfigNumber('SHORT_TERM_MIN_TRADE_USD', process.env.SHORT_TERM_MIN_TRADE_USD, 25000); }, // Lowered from 50K to catch more trades
  get SHORT_TERM_LOOKBACK_HOURS() { return getConfigNumber('SHORT_TERM_LOOKBACK_HOURS', process.env.SHORT_TERM_LOOKBACK_HOURS, 6); }, // Extended from 2h to catch more trades
  get SHORT_TERM_BUDGET_PERCENT() { return getConfigNumber('SHORT_TERM_BUDGET_PERCENT', process.env.SHORT_TERM_BUDGET_PERCENT, 30); }, // 30% of capital
  
  // Long-Term Strategy (politics, crypto, world events - lower risk, slower turnover)
  get LONG_TERM_ENABLED() { return getConfigBoolean('LONG_TERM_ENABLED', process.env.LONG_TERM_ENABLED, true); },
  get LONG_TERM_MIN_HOURS() { return getConfigNumber('LONG_TERM_MIN_HOURS', process.env.LONG_TERM_MIN_HOURS, 48); },   // Min 48h to resolution
  get LONG_TERM_MAX_HOURS() { return getConfigNumber('LONG_TERM_MAX_HOURS', process.env.LONG_TERM_MAX_HOURS, 8760); }, // Max 1 year
  get LONG_TERM_MIN_TRADE_USD() { return getConfigNumber('LONG_TERM_MIN_TRADE_USD', process.env.LONG_TERM_MIN_TRADE_USD, 5000); },  // Lower threshold ($5k)
  get LONG_TERM_LOOKBACK_HOURS() { return getConfigNumber('LONG_TERM_LOOKBACK_HOURS', process.env.LONG_TERM_LOOKBACK_HOURS, 24); }, // Look back 24h
  get LONG_TERM_BUDGET_PERCENT() { return getConfigNumber('LONG_TERM_BUDGET_PERCENT', process.env.LONG_TERM_BUDGET_PERCENT, 70); }, // 70% of capital
  
  // Suspicion Score Weights
  WEIGHTS: {
    WALLET_AGE: 0.25,
    TRADE_SIZE: 0.20,
    WIN_RATE: 0.20,
    MARKET_SELECTION: 0.15,
    BET_TIMING: 0.10,
    CONCENTRATION: 0.10,
  },
  
  // Rating System
  get MIN_CONFIDENCE_FOR_TRADE() { return getConfigNumber('MIN_CONFIDENCE_FOR_TRADE', process.env.MIN_CONFIDENCE_FOR_TRADE, 70); },
  
  // Paper Trading
  get INITIAL_PAPER_BALANCE() { return getConfigNumber('INITIAL_PAPER_BALANCE', process.env.INITIAL_PAPER_BALANCE, 10000); },
  get MAX_POSITION_SIZE_PERCENT() { return getConfigNumber('MAX_POSITION_SIZE_PERCENT', process.env.MAX_POSITION_SIZE_PERCENT, 10); },
  
  // Kelly Criterion Bankroll Management
  get KELLY_FRACTION() { return getConfigNumber('KELLY_FRACTION', process.env.KELLY_FRACTION, 0.5); },
  get MIN_TRADE_AMOUNT_USD() { return getConfigNumber('MIN_TRADE_AMOUNT_USD', process.env.MIN_TRADE_AMOUNT_USD, 5); },
  get MAX_KELLY_BET_PERCENT() { return getConfigNumber('MAX_KELLY_BET_PERCENT', process.env.MAX_KELLY_BET_PERCENT, 10); },
  
  // Position & Capital Limits
  get MAX_OPEN_POSITIONS() { return getConfigNumber('MAX_OPEN_POSITIONS', process.env.MAX_OPEN_POSITIONS, 30); },
  get MAX_LOCKED_CAPITAL_PERCENT() { return getConfigNumber('MAX_LOCKED_CAPITAL_PERCENT', process.env.MAX_LOCKED_CAPITAL_PERCENT, 80); },
  get LOW_BALANCE_WARNING_PERCENT() { return getConfigNumber('LOW_BALANCE_WARNING_PERCENT', process.env.LOW_BALANCE_WARNING_PERCENT, 20); },
  
  // Real Trading Mode
  get TRADING_MODE() { return getConfigString('TRADING_MODE', process.env.TRADING_MODE, 'paper') as 'paper' | 'real'; },
  get REAL_TRADING_ENABLED() { return getConfigString('TRADING_MODE', process.env.TRADING_MODE, 'paper') === 'real'; },
  get REAL_TRADING_PRIVATE_KEY() { return getConfigString('REAL_TRADING_PRIVATE_KEY', process.env.REAL_TRADING_PRIVATE_KEY, ''); },
  get REAL_TRADING_FUNDER_ADDRESS() { return getConfigString('REAL_TRADING_FUNDER_ADDRESS', process.env.REAL_TRADING_FUNDER_ADDRESS, ''); },
  get REAL_TRADING_SIGNATURE_TYPE() { return getConfigNumber('REAL_TRADING_SIGNATURE_TYPE', process.env.REAL_TRADING_SIGNATURE_TYPE, 0); },
  get REAL_TRADING_CHAIN_ID() { return getConfigNumber('REAL_TRADING_CHAIN_ID', process.env.REAL_TRADING_CHAIN_ID, 137); },
  
  // Real Trading Safety Limits
  get REAL_TRADING_MAX_POSITION_USD() { return getConfigNumber('REAL_TRADING_MAX_POSITION_USD', process.env.REAL_TRADING_MAX_POSITION_USD, 1000); },
  get REAL_TRADING_DAILY_LIMIT_USD() { return getConfigNumber('REAL_TRADING_DAILY_LIMIT_USD', process.env.REAL_TRADING_DAILY_LIMIT_USD, 5000); },
  get REAL_TRADING_START_HOUR() { return getConfigNumber('REAL_TRADING_START_HOUR', process.env.REAL_TRADING_START_HOUR, 0); },
  get REAL_TRADING_END_HOUR() { return getConfigNumber('REAL_TRADING_END_HOUR', process.env.REAL_TRADING_END_HOUR, 23); },
  get REAL_TRADING_KILL_SWITCH_ENABLED() { return getConfigBoolean('REAL_TRADING_KILL_SWITCH_ENABLED', process.env.REAL_TRADING_KILL_SWITCH_ENABLED, false); },
  
  // Real Trading Extra Safety
  get REAL_TRADING_MIN_SHARES() { return getConfigNumber('REAL_TRADING_MIN_SHARES', process.env.REAL_TRADING_MIN_SHARES, 1); },
  get REAL_TRADING_MAX_SLIPPAGE_PERCENT() { return getConfigNumber('REAL_TRADING_MAX_SLIPPAGE_PERCENT', process.env.REAL_TRADING_MAX_SLIPPAGE_PERCENT, 2); },
  get REAL_TRADING_CONFIRMATION_DELAY_MS() { return getConfigNumber('REAL_TRADING_CONFIRMATION_DELAY_MS', process.env.REAL_TRADING_CONFIRMATION_DELAY_MS, 0); },
  get REAL_TRADING_DRY_RUN() { return getConfigBoolean('REAL_TRADING_DRY_RUN', process.env.REAL_TRADING_DRY_RUN, false); },
  get ORDER_TIMEOUT_SECONDS() { return getConfigNumber('ORDER_TIMEOUT_SECONDS', process.env.ORDER_TIMEOUT_SECONDS, 60); },
  
  // Polling
  get TRADE_POLL_INTERVAL_MS() { return getConfigNumber('TRADE_POLL_INTERVAL_MS', process.env.TRADE_POLL_INTERVAL_MS, 30000); },
  get ORDER_STATUS_POLL_INTERVAL() { return getConfigNumber('ORDER_STATUS_POLL_INTERVAL', process.env.ORDER_STATUS_POLL_INTERVAL, 30000); },
  LEADERBOARD_REFRESH_HOURS: 6,
  PROFILE_CACHE_MINUTES: 60,
  get RESOLUTION_CHECK_INTERVAL_MS() { return getConfigNumber('RESOLUTION_CHECK_INTERVAL_MS', process.env.RESOLUTION_CHECK_INTERVAL_MS, 300000); },
  
  // WebSocket
  get USE_WEBSOCKET() { return getConfigBoolean('USE_WEBSOCKET', process.env.USE_WEBSOCKET, false); },
  get WS_RECONNECT_DELAY_MS() { return getConfigNumber('WS_RECONNECT_DELAY_MS', process.env.WS_RECONNECT_DELAY_MS, 5000); },
  get WS_MAX_RECONNECT_ATTEMPTS() { return getConfigNumber('WS_MAX_RECONNECT_ATTEMPTS', process.env.WS_MAX_RECONNECT_ATTEMPTS, 5); },
  get WS_PING_INTERVAL_MS() { return getConfigNumber('WS_PING_INTERVAL_MS', process.env.WS_PING_INTERVAL_MS, 10000); },
  
  // API Endpoints
  DATA_API: 'https://data-api.polymarket.com',
  GAMMA_API: 'https://gamma-api.polymarket.com',
  CLOB_API: 'https://clob.polymarket.com',
  WSS_ENDPOINT: 'wss://ws-subscriptions-clob.polymarket.com/ws/',
  
  // Notifications
  get TELEGRAM_ENABLED() { return getConfigBoolean('TELEGRAM_ENABLED', process.env.TELEGRAM_ENABLED, false); },
  get TELEGRAM_BOT_TOKEN() { return getConfigString('TELEGRAM_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN, ''); },
  get TELEGRAM_CHAT_ID() { return getConfigString('TELEGRAM_CHAT_ID', process.env.TELEGRAM_CHAT_ID, ''); },
  
  // Logging
  get LOG_LEVEL() { return getConfigString('LOG_LEVEL', process.env.LOG_LEVEL, 'info'); },
  LOG_TO_FILE: true,
  LOG_DIR: './logs',
  DATA_DIR: './data',
  
  // Error Handling
  get ERROR_LOG_LEVEL_422() { return getConfigString('ERROR_LOG_LEVEL_422', process.env.ERROR_LOG_LEVEL_422, 'warn'); },
  get MARKET_AGE_THRESHOLD_DAYS() { return getConfigNumber('MARKET_AGE_THRESHOLD_DAYS', process.env.MARKET_AGE_THRESHOLD_DAYS, 7); },
  get MARK_OLD_AS_ARCHIVED() { return getConfigBoolean('MARK_OLD_AS_ARCHIVED', process.env.MARK_OLD_AS_ARCHIVED, true); },
  
  // Web Dashboard
  get DASHBOARD_ENABLED() { return getConfigBoolean('DASHBOARD_ENABLED', process.env.DASHBOARD_ENABLED, false); },
  get DASHBOARD_PORT() { return getConfigNumber('DASHBOARD_PORT', process.env.DASHBOARD_PORT, 3000); },
  get DASHBOARD_PASSWORD() { return getConfigString('DASHBOARD_PASSWORD', process.env.DASHBOARD_PASSWORD, 'admin123'); },
  get DASHBOARD_SESSION_SECRET() { return getConfigString('DASHBOARD_SESSION_SECRET', process.env.DASHBOARD_SESSION_SECRET, generateRandomSecret()); },
};
