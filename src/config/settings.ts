import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

/**
 * Generate a random secret key if not provided
 */
function generateRandomSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export const CONFIG = {
  // Whale Detection
  WHALE_THRESHOLD_USD: Number(process.env.WHALE_THRESHOLD_USD) || 50000,
  NEW_WALLET_HOURS: Number(process.env.NEW_WALLET_HOURS) || 24,
  
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
  MIN_CONFIDENCE_FOR_TRADE: Number(process.env.MIN_CONFIDENCE_FOR_TRADE) || 70,
  
  // Paper Trading
  INITIAL_PAPER_BALANCE: Number(process.env.INITIAL_PAPER_BALANCE) || 10000,
  MAX_POSITION_SIZE_PERCENT: Number(process.env.MAX_POSITION_SIZE_PERCENT) || 10,
  
  // Kelly Criterion Bankroll Management
  KELLY_FRACTION: Number(process.env.KELLY_FRACTION) || 0.5, // Fractional Kelly (0.5 = half-Kelly)
  MIN_TRADE_AMOUNT_USD: Number(process.env.MIN_TRADE_AMOUNT_USD) || 5, // Skip trades below this
  MAX_KELLY_BET_PERCENT: Number(process.env.MAX_KELLY_BET_PERCENT) || 10, // Cap Kelly bets at this %
  
  // Position & Capital Limits (prevents over-leveraging)
  MAX_OPEN_POSITIONS: Number(process.env.MAX_OPEN_POSITIONS) || 30, // Max concurrent open trades
  MAX_LOCKED_CAPITAL_PERCENT: Number(process.env.MAX_LOCKED_CAPITAL_PERCENT) || 80, // Max % of initial balance locked
  LOW_BALANCE_WARNING_PERCENT: Number(process.env.LOW_BALANCE_WARNING_PERCENT) || 20, // Warn when available balance drops below this %
  
  // Real Trading Mode
  TRADING_MODE: (process.env.TRADING_MODE as 'paper' | 'real') || 'paper',
  REAL_TRADING_ENABLED: process.env.TRADING_MODE === 'real',
  REAL_TRADING_PRIVATE_KEY: process.env.REAL_TRADING_PRIVATE_KEY || '',
  REAL_TRADING_FUNDER_ADDRESS: process.env.REAL_TRADING_FUNDER_ADDRESS || '',
  REAL_TRADING_SIGNATURE_TYPE: Number(process.env.REAL_TRADING_SIGNATURE_TYPE) || 0, // 0=EOA, 1=Magic, 2=Gnosis
  REAL_TRADING_CHAIN_ID: Number(process.env.REAL_TRADING_CHAIN_ID) || 137, // Polygon mainnet
  
  // Real Trading Safety Limits
  REAL_TRADING_MAX_POSITION_USD: Number(process.env.REAL_TRADING_MAX_POSITION_USD) || 1000,
  REAL_TRADING_DAILY_LIMIT_USD: Number(process.env.REAL_TRADING_DAILY_LIMIT_USD) || 5000,
  REAL_TRADING_START_HOUR: Number(process.env.REAL_TRADING_START_HOUR) || 0, // UTC
  REAL_TRADING_END_HOUR: Number(process.env.REAL_TRADING_END_HOUR) || 23, // UTC
  REAL_TRADING_KILL_SWITCH_ENABLED: process.env.REAL_TRADING_KILL_SWITCH_ENABLED === 'true',
  
  // Real Trading Extra Safety
  REAL_TRADING_MIN_SHARES: Number(process.env.REAL_TRADING_MIN_SHARES) || 1, // Minimum shares per order
  REAL_TRADING_MAX_SLIPPAGE_PERCENT: Number(process.env.REAL_TRADING_MAX_SLIPPAGE_PERCENT) || 2, // Max 2% slippage
  REAL_TRADING_CONFIRMATION_DELAY_MS: Number(process.env.REAL_TRADING_CONFIRMATION_DELAY_MS) || 0, // Delay before execution (0 = no delay)
  REAL_TRADING_DRY_RUN: process.env.REAL_TRADING_DRY_RUN === 'true', // Log trades without executing
  
  // Polling
  TRADE_POLL_INTERVAL_MS: Number(process.env.TRADE_POLL_INTERVAL_MS) || 30000,
  ORDER_STATUS_POLL_INTERVAL: Number(process.env.ORDER_STATUS_POLL_INTERVAL) || 30000, // 30 seconds
  LEADERBOARD_REFRESH_HOURS: 6,
  PROFILE_CACHE_MINUTES: 60,
  RESOLUTION_CHECK_INTERVAL_MS: Number(process.env.RESOLUTION_CHECK_INTERVAL_MS) || 300000, // 5 minutes
  
  // WebSocket
  USE_WEBSOCKET: process.env.USE_WEBSOCKET === 'true',
  WS_RECONNECT_DELAY_MS: Number(process.env.WS_RECONNECT_DELAY_MS) || 5000,
  WS_MAX_RECONNECT_ATTEMPTS: Number(process.env.WS_MAX_RECONNECT_ATTEMPTS) || 5,
  WS_PING_INTERVAL_MS: Number(process.env.WS_PING_INTERVAL_MS) || 10000,
  
  // API Endpoints
  DATA_API: 'https://data-api.polymarket.com',
  GAMMA_API: 'https://gamma-api.polymarket.com',
  CLOB_API: 'https://clob.polymarket.com',
  WSS_ENDPOINT: 'wss://ws-subscriptions-clob.polymarket.com/ws/',
  
  // Notifications
  TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED === 'true',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_TO_FILE: true,
  LOG_DIR: './logs',
  DATA_DIR: './data',
  
  // Error Handling
  ERROR_LOG_LEVEL_422: process.env.ERROR_LOG_LEVEL_422 || 'warn',
  MARKET_AGE_THRESHOLD_DAYS: Number(process.env.MARKET_AGE_THRESHOLD_DAYS) || 7,
  MARK_OLD_AS_ARCHIVED: process.env.MARK_OLD_AS_ARCHIVED !== 'false',
  
  // Web Dashboard
  DASHBOARD_ENABLED: process.env.DASHBOARD_ENABLED === 'true',
  DASHBOARD_PORT: Number(process.env.DASHBOARD_PORT) || 3000,
  DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD || 'admin123',
  DASHBOARD_SESSION_SECRET: process.env.DASHBOARD_SESSION_SECRET || generateRandomSecret(),
};
