import dotenv from 'dotenv';

dotenv.config();

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
  
  // Polling
  TRADE_POLL_INTERVAL_MS: Number(process.env.TRADE_POLL_INTERVAL_MS) || 30000,
  LEADERBOARD_REFRESH_HOURS: 6,
  PROFILE_CACHE_MINUTES: 60,
  
  // API Endpoints
  DATA_API: 'https://data-api.polymarket.com',
  GAMMA_API: 'https://gamma-api.polymarket.com',
  CLOB_API: 'https://clob.polymarket.com',
  WSS_ENDPOINT: 'wss://ws-subscriptions-clob.polymarket.com/ws/',
  
  // Notifications
  TELEGRAM_ENABLED: !!process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_TO_FILE: true,
  LOG_DIR: './logs',
  DATA_DIR: './data',
};
