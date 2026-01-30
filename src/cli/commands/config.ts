/**
 * Config Command
 * Interactive configuration editor
 */

import fs from 'fs';
import path from 'path';
import { CONFIG } from '../../config/settings.js';

export async function configCommand(options: string[]): Promise<void> {
  console.log('\n⚙️  Configuration Editor\n');
  console.log('Current Configuration:\n');
  
  // Display current config
  console.log('📊 Trading Settings:');
  console.log(`  Trading Mode:         ${CONFIG.TRADING_MODE}`);
  console.log(`  Whale Threshold:      $${CONFIG.WHALE_THRESHOLD_USD.toLocaleString()}`);
  console.log(`  New Wallet Hours:     ${CONFIG.NEW_WALLET_HOURS}h`);
  console.log(`  Min Confidence:       ${CONFIG.MIN_CONFIDENCE_FOR_TRADE}%`);
  console.log(`  Initial Balance:      $${CONFIG.INITIAL_PAPER_BALANCE.toLocaleString()}`);
  console.log(`  Max Position Size:    ${CONFIG.MAX_POSITION_SIZE_PERCENT}%`);
  console.log('');
  
  console.log('🔄 Polling Intervals:');
  console.log(`  Trade Poll:           ${CONFIG.TRADE_POLL_INTERVAL_MS / 1000}s`);
  console.log(`  Resolution Check:     ${CONFIG.RESOLUTION_CHECK_INTERVAL_MS / 1000}s`);
  console.log('');
  
  console.log('🌐 Dashboard:');
  console.log(`  Enabled:              ${CONFIG.DASHBOARD_ENABLED}`);
  console.log(`  Port:                 ${CONFIG.DASHBOARD_PORT}`);
  console.log('');
  
  console.log('💵 Real Trading:');
  console.log(`  Enabled:              ${CONFIG.REAL_TRADING_ENABLED}`);
  if (CONFIG.REAL_TRADING_ENABLED) {
    console.log(`  Max Position:         $${CONFIG.REAL_TRADING_MAX_POSITION_USD.toLocaleString()}`);
    console.log(`  Daily Limit:          $${CONFIG.REAL_TRADING_DAILY_LIMIT_USD.toLocaleString()}`);
    console.log(`  Trading Hours:        ${CONFIG.REAL_TRADING_START_HOUR}:00 - ${CONFIG.REAL_TRADING_END_HOUR}:00`);
    console.log(`  Kill Switch:          ${CONFIG.REAL_TRADING_KILL_SWITCH_ENABLED}`);
  }
  console.log('');
  
  console.log('📝 Logging:');
  console.log(`  Log Level:            ${CONFIG.LOG_LEVEL}`);
  console.log('');
  
  // Find .env file
  const envPath = path.join(process.cwd(), '.env');
  
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found. Create one from .env.example:');
    console.error('   cp .env.example .env');
    process.exit(1);
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('To modify configuration:');
  console.log(`  1. Edit: ${envPath}`);
  console.log('  2. Restart the bot for changes to take effect');
  console.log('');
  console.log('Example:');
  console.log('  nano .env              # On Linux');
  console.log('  notepad .env           # On Windows');
  console.log('');
  console.log('Key Settings:');
  console.log('  WHALE_THRESHOLD_USD    - Minimum trade size to detect whales');
  console.log('  MIN_CONFIDENCE_FOR_TRADE - Minimum score to execute trades');
  console.log('  TRADING_MODE           - paper (default) or real');
  console.log('  DASHBOARD_ENABLED      - true/false to enable dashboard');
  console.log('  LOG_LEVEL              - debug, info, warn, error');
  console.log('');
}
