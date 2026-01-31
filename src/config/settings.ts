import dotenv from 'dotenv';
import crypto from 'crypto';
import { getRuntimeConfig } from '../models/config.js';

dotenv.config();

/**
 * Generate a random secret key if not provided
 */
function generateRandomSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Load runtime overrides from database (for Docker deployments with read-only .env)
let runtimeConfig: Record<string, string> = {};
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
  // Whale Detection
  WHALE_THRESHOLD_USD: getConfigNumber('WHALE_THRESHOLD_USD', process.env.WHALE_THRESHOLD_USD, 50000),
  NEW_WALLET_HOURS: getConfigNumber('NEW_WALLET_HOURS', process.env.NEW_WALLET_HOURS, 24),
  
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
  MIN_CONFIDENCE_FOR_TRADE: getConfigNumber('MIN_CONFIDENCE_FOR_TRADE', process.env.MIN_CONFIDENCE_FOR_TRADE, 70),
  
  // Paper Trading
  INITIAL_PAPER_BALANCE: getConfigNumber('INITIAL_PAPER_BALANCE', process.env.INITIAL_PAPER_BALANCE, 10000),
  MAX_POSITION_SIZE_PERCENT: getConfigNumber('MAX_POSITION_SIZE_PERCENT', process.env.MAX_POSITION_SIZE_PERCENT, 10),
  
  // Kelly Criterion Bankroll Management
  KELLY_FRACTION: getConfigNumber('KELLY_FRACTION', process.env.KELLY_FRACTION, 0.5),
  MIN_TRADE_AMOUNT_USD: getConfigNumber('MIN_TRADE_AMOUNT_USD', process.env.MIN_TRADE_AMOUNT_USD, 5),
  MAX_KELLY_BET_PERCENT: getConfigNumber('MAX_KELLY_BET_PERCENT', process.env.MAX_KELLY_BET_PERCENT, 10),
  
  // Position & Capital Limits
  MAX_OPEN_POSITIONS: getConfigNumber('MAX_OPEN_POSITIONS', process.env.MAX_OPEN_POSITIONS, 30),
  MAX_LOCKED_CAPITAL_PERCENT: getConfigNumber('MAX_LOCKED_CAPITAL_PERCENT', process.env.MAX_LOCKED_CAPITAL_PERCENT, 80),
  LOW_BALANCE_WARNING_PERCENT: getConfigNumber('LOW_BALANCE_WARNING_PERCENT', process.env.LOW_BALANCE_WARNING_PERCENT, 20),
  
  // Real Trading Mode
  TRADING_MODE: (getConfigString('TRADING_MODE', process.env.TRADING_MODE, 'paper') as 'paper' | 'real'),
  REAL_TRADING_ENABLED: getConfigString('TRADING_MODE', process.env.TRADING_MODE, 'paper') === 'real',
  REAL_TRADING_PRIVATE_KEY: getConfigString('REAL_TRADING_PRIVATE_KEY', process.env.REAL_TRADING_PRIVATE_KEY, ''),
  REAL_TRADING_FUNDER_ADDRESS: getConfigString('REAL_TRADING_FUNDER_ADDRESS', process.env.REAL_TRADING_FUNDER_ADDRESS, ''),
  REAL_TRADING_SIGNATURE_TYPE: getConfigNumber('REAL_TRADING_SIGNATURE_TYPE', process.env.REAL_TRADING_SIGNATURE_TYPE, 0),
  REAL_TRADING_CHAIN_ID: getConfigNumber('REAL_TRADING_CHAIN_ID', process.env.REAL_TRADING_CHAIN_ID, 137),
  
  // Real Trading Safety Limits
  REAL_TRADING_MAX_POSITION_USD: getConfigNumber('REAL_TRADING_MAX_POSITION_USD', process.env.REAL_TRADING_MAX_POSITION_USD, 1000),
  REAL_TRADING_DAILY_LIMIT_USD: getConfigNumber('REAL_TRADING_DAILY_LIMIT_USD', process.env.REAL_TRADING_DAILY_LIMIT_USD, 5000),
  REAL_TRADING_START_HOUR: getConfigNumber('REAL_TRADING_START_HOUR', process.env.REAL_TRADING_START_HOUR, 0),
  REAL_TRADING_END_HOUR: getConfigNumber('REAL_TRADING_END_HOUR', process.env.REAL_TRADING_END_HOUR, 23),
  REAL_TRADING_KILL_SWITCH_ENABLED: getConfigBoolean('REAL_TRADING_KILL_SWITCH_ENABLED', process.env.REAL_TRADING_KILL_SWITCH_ENABLED, false),
  
  // Real Trading Extra Safety
  REAL_TRADING_MIN_SHARES: getConfigNumber('REAL_TRADING_MIN_SHARES', process.env.REAL_TRADING_MIN_SHARES, 1),
  REAL_TRADING_MAX_SLIPPAGE_PERCENT: getConfigNumber('REAL_TRADING_MAX_SLIPPAGE_PERCENT', process.env.REAL_TRADING_MAX_SLIPPAGE_PERCENT, 2),
  REAL_TRADING_CONFIRMATION_DELAY_MS: getConfigNumber('REAL_TRADING_CONFIRMATION_DELAY_MS', process.env.REAL_TRADING_CONFIRMATION_DELAY_MS, 0),
  REAL_TRADING_DRY_RUN: getConfigBoolean('REAL_TRADING_DRY_RUN', process.env.REAL_TRADING_DRY_RUN, false),
  ORDER_TIMEOUT_SECONDS: getConfigNumber('ORDER_TIMEOUT_SECONDS', process.env.ORDER_TIMEOUT_SECONDS, 60),
  
  // Polling
  TRADE_POLL_INTERVAL_MS: getConfigNumber('TRADE_POLL_INTERVAL_MS', process.env.TRADE_POLL_INTERVAL_MS, 30000),
  ORDER_STATUS_POLL_INTERVAL: getConfigNumber('ORDER_STATUS_POLL_INTERVAL', process.env.ORDER_STATUS_POLL_INTERVAL, 30000),
  LEADERBOARD_REFRESH_HOURS: 6,
  PROFILE_CACHE_MINUTES: 60,
  RESOLUTION_CHECK_INTERVAL_MS: getConfigNumber('RESOLUTION_CHECK_INTERVAL_MS', process.env.RESOLUTION_CHECK_INTERVAL_MS, 300000),
  
  // WebSocket
  USE_WEBSOCKET: getConfigBoolean('USE_WEBSOCKET', process.env.USE_WEBSOCKET, false),
  WS_RECONNECT_DELAY_MS: getConfigNumber('WS_RECONNECT_DELAY_MS', process.env.WS_RECONNECT_DELAY_MS, 5000),
  WS_MAX_RECONNECT_ATTEMPTS: getConfigNumber('WS_MAX_RECONNECT_ATTEMPTS', process.env.WS_MAX_RECONNECT_ATTEMPTS, 5),
  WS_PING_INTERVAL_MS: getConfigNumber('WS_PING_INTERVAL_MS', process.env.WS_PING_INTERVAL_MS, 10000),
  
  // API Endpoints
  DATA_API: 'https://data-api.polymarket.com',
  GAMMA_API: 'https://gamma-api.polymarket.com',
  CLOB_API: 'https://clob.polymarket.com',
  WSS_ENDPOINT: 'wss://ws-subscriptions-clob.polymarket.com/ws/',
  
  // Notifications
  TELEGRAM_ENABLED: getConfigBoolean('TELEGRAM_ENABLED', process.env.TELEGRAM_ENABLED, false),
  TELEGRAM_BOT_TOKEN: getConfigString('TELEGRAM_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN, ''),
  TELEGRAM_CHAT_ID: getConfigString('TELEGRAM_CHAT_ID', process.env.TELEGRAM_CHAT_ID, ''),
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_TO_FILE: true,
  LOG_DIR: './logs',
  DATA_DIR: './data',
  
  // Error Handling
  ERROR_LOG_LEVEL_422: process.env.ERROR_LOG_LEVEL_422 || 'warn',
  MARKET_AGE_THRESHOLD_DAYS: getConfigNumber('MARKET_AGE_THRESHOLD_DAYS', process.env.MARKET_AGE_THRESHOLD_DAYS, 7),
  MARK_OLD_AS_ARCHIVED: getConfigBoolean('MARK_OLD_AS_ARCHIVED', process.env.MARK_OLD_AS_ARCHIVED, true),
  
  // Web Dashboard
  DASHBOARD_ENABLED: getConfigBoolean('DASHBOARD_ENABLED', process.env.DASHBOARD_ENABLED, false),
  DASHBOARD_PORT: getConfigNumber('DASHBOARD_PORT', process.env.DASHBOARD_PORT, 3000),
  DASHBOARD_PASSWORD: getConfigString('DASHBOARD_PASSWORD', process.env.DASHBOARD_PASSWORD, 'admin123'),
  DASHBOARD_SESSION_SECRET: process.env.DASHBOARD_SESSION_SECRET || generateRandomSecret(),
};
