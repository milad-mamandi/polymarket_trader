/**
 * Stats Command
 * Show bot statistics and performance
 */

import { initializeDatabase, getDatabaseStats } from '../../models/database.js';
import { getPaperTradeStats } from '../../models/paperTrade.js';
import { getRealTradeStats } from '../../models/realTrade.js';
import { tradeEngine } from '../../services/tradeEngine.js';
import { CONFIG } from '../../config/settings.js';

export async function statsCommand(options: string[]): Promise<void> {
  // Initialize database
  initializeDatabase();
  
  console.log('\n🐋 Polymarket Whale Scout - Statistics\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Database stats
  const dbStats = getDatabaseStats();
  console.log('📊 Database Statistics:');
  console.log(`  Tracked Wallets:     ${dbStats.totalWallets}`);
  console.log(`  Wallet Trades:       ${dbStats.totalWalletTrades}`);
  console.log(`  Paper Trades:        ${dbStats.totalPaperTrades}`);
  console.log(`  Open Paper Trades:   ${dbStats.openPaperTrades}`);
  console.log(`  Real Trades:         ${dbStats.totalRealTrades}`);
  console.log(`  Open Real Trades:    ${dbStats.openRealTrades}`);
  console.log('');
  
  // Paper trading stats
  const paperStats = getPaperTradeStats();
  console.log('💰 Paper Trading Performance:');
  
  // Initialize trade engine to get balance
  tradeEngine.initialize();
  const portfolio = tradeEngine.getPortfolioStatus();
  const returnPercent = portfolio.pnlPercent.toFixed(2);
  
  console.log(`  Initial Balance:     $${portfolio.startingBalance.toFixed(2)}`);
  console.log(`  Current Balance:     $${portfolio.currentBalance.toFixed(2)}`);
  console.log(`  Total P&L:           ${portfolio.pnl >= 0 ? '+' : ''}$${portfolio.pnl.toFixed(2)} (${returnPercent}%)`);
  console.log(`  Total Trades:        ${paperStats.total}`);
  console.log(`  Open Positions:      ${paperStats.open}`);
  console.log(`  Winning Trades:      ${paperStats.winning}`);
  console.log(`  Losing Trades:       ${paperStats.losing}`);
  console.log(`  Cancelled:           ${paperStats.cancelled}`);
  
  if (paperStats.completed > 0) {
    console.log(`  Win Rate:            ${(paperStats.winRate * 100).toFixed(1)}%`);
    console.log(`  Avg P&L per Trade:   ${paperStats.avg_pnl >= 0 ? '+' : ''}$${paperStats.avg_pnl.toFixed(2)}`);
    console.log(`  Best Trade:          +$${paperStats.best_pnl.toFixed(2)}`);
    console.log(`  Worst Trade:         -$${Math.abs(paperStats.worst_pnl).toFixed(2)}`);
  }
  console.log('');
  
  // Real trading stats (if enabled)
  if (CONFIG.REAL_TRADING_ENABLED) {
    const realStats = getRealTradeStats();
    console.log('💵 Real Trading Performance:');
    console.log(`  Total Trades:        ${realStats.total}`);
    console.log(`  Open Positions:      ${realStats.open}`);
    console.log(`  Winning Trades:      ${realStats.winning}`);
    console.log(`  Losing Trades:       ${realStats.losing}`);
    
    if (realStats.completed > 0) {
      console.log(`  Win Rate:            ${(realStats.winRate * 100).toFixed(1)}%`);
      console.log(`  Total P&L:           ${realStats.total_pnl >= 0 ? '+' : ''}$${realStats.total_pnl.toFixed(2)}`);
      console.log(`  Avg P&L per Trade:   ${realStats.avg_pnl >= 0 ? '+' : ''}$${realStats.avg_pnl.toFixed(2)}`);
      console.log(`  Best Trade:          +$${realStats.best_pnl.toFixed(2)}`);
      console.log(`  Worst Trade:         -$${Math.abs(realStats.worst_pnl).toFixed(2)}`);
    }
    console.log('');
  }
  
  // Configuration
  console.log('⚙️  Configuration:');
  console.log(`  Trading Mode:        ${CONFIG.TRADING_MODE.toUpperCase()}`);
  console.log(`  Whale Threshold:     $${CONFIG.WHALE_THRESHOLD_USD.toLocaleString()}`);
  console.log(`  Min Confidence:      ${CONFIG.MIN_CONFIDENCE_FOR_TRADE}%`);
  console.log(`  Max Position Size:   ${CONFIG.MAX_POSITION_SIZE_PERCENT}%`);
  console.log(`  Dashboard:           ${CONFIG.DASHBOARD_ENABLED ? 'Enabled' : 'Disabled'}`);
  if (CONFIG.DASHBOARD_ENABLED) {
    console.log(`  Dashboard Port:      ${CONFIG.DASHBOARD_PORT}`);
  }
  console.log('');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
