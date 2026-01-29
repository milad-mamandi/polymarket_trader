import { Command } from 'commander';
import chalk from 'chalk';
import { initializeDatabase } from '../../models/database.js';
import { getPaperTradeStats, getAllPaperTrades } from '../../models/paperTrade.js';
import { getAllWatchedWallets } from '../../models/wallet.js';
import { db } from '../../models/database.js';
import { formatUSD } from '../../utils/helpers.js';
import { CONFIG } from '../../config/settings.js';

export const statsCommand = new Command('stats')
  .description('Show performance statistics')
  .option('-p, --period <period>', 'Time period: day, week, month, all', 'all')
  .option('-v, --verbose', 'Show detailed breakdown', false)
  .action(async (options) => {
    try {
      initializeDatabase();
      
      // Get paper trade stats
      const stats = getPaperTradeStats();
      const allTrades = getAllPaperTrades(1000);
      
      // Filter by period
      let filteredTrades = allTrades;
      const now = Date.now();
      const periodMap: Record<string, number> = {
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        all: Infinity,
      };
      
      const periodMs = periodMap[options.period.toLowerCase()] || Infinity;
      if (periodMs !== Infinity) {
        const cutoff = now - periodMs;
        filteredTrades = allTrades.filter(t => new Date(t.timestamp).getTime() >= cutoff);
      }
      
      // Calculate stats for filtered period
      const periodStats = {
        total: filteredTrades.length,
        won: filteredTrades.filter(t => t.status === 'WON').length,
        lost: filteredTrades.filter(t => t.status === 'LOST').length,
        cancelled: filteredTrades.filter(t => t.status === 'CANCELLED').length,
        open: filteredTrades.filter(t => t.status === 'OPEN').length,
        totalPnl: filteredTrades.reduce((sum, t) => sum + (t.pnl || 0), 0),
        bestTrade: filteredTrades.reduce((best, t) => (t.pnl || 0) > (best.pnl || 0) ? t : best, filteredTrades[0]),
        worstTrade: filteredTrades.reduce((worst, t) => (t.pnl || 0) < (worst.pnl || 0) ? t : worst, filteredTrades[0]),
      };
      
      const resolved = periodStats.won + periodStats.lost;
      const winRate = resolved > 0 ? (periodStats.won / resolved) * 100 : 0;
      
      // Get wallet stats
      const wallets = getAllWatchedWallets();
      const walletTrades = db.prepare('SELECT COUNT(*) as count FROM wallet_trades').get() as { count: number };
      const resolvedTrades = db.prepare('SELECT COUNT(*) as count FROM wallet_trades WHERE resolved = 1').get() as { count: number };
      const archivedTrades = db.prepare('SELECT COUNT(*) as count FROM wallet_trades WHERE archived = 1').get() as { count: number };
      
      // Get earliest trade date
      const firstTrade = db.prepare('SELECT MIN(timestamp) as first FROM paper_trades').get() as { first: string | null };
      const startDate = firstTrade?.first ? new Date(firstTrade.first).toISOString().split('T')[0] : 'N/A';
      
      // Calculate current balance
      const currentBalance = CONFIG.INITIAL_PAPER_BALANCE + stats.total_pnl;
      const roi = ((currentBalance - CONFIG.INITIAL_PAPER_BALANCE) / CONFIG.INITIAL_PAPER_BALANCE) * 100;
      
      // Display stats
      console.log();
      console.log(chalk.bold.cyan('┌─────────────────────────────────────────────────────────────────┐'));
      console.log(chalk.bold.cyan('│') + chalk.bold.white('               WHALE SCOUT PERFORMANCE STATS                  ') + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('├─────────────────────────────────────────────────────────────────┤'));
      console.log(chalk.bold.cyan('│') + chalk.white(` Period: ${options.period === 'all' ? 'All Time' : options.period.charAt(0).toUpperCase() + options.period.slice(1)} (since ${startDate})`.padEnd(64)) + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('├─────────────────────────────────────────────────────────────────┤'));
      console.log(chalk.bold.cyan('│') + '                                                                 ' + chalk.bold.cyan('│'));
      
      // Paper trading section
      console.log(chalk.bold.cyan('│') + chalk.bold.white(' PAPER TRADING                                                   ') + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + chalk.gray(' ─────────────                                                   ') + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + chalk.white(` Total Trades:      ${String(periodStats.total).padStart(4)}`.padEnd(65)) + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + chalk.green(` Won:               ${String(periodStats.won).padStart(4)} (${(periodStats.total > 0 ? (periodStats.won / periodStats.total * 100) : 0).toFixed(1)}%)`.padEnd(65)) + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + chalk.red(` Lost:              ${String(periodStats.lost).padStart(4)} (${(periodStats.total > 0 ? (periodStats.lost / periodStats.total * 100) : 0).toFixed(1)}%)`.padEnd(65)) + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + chalk.yellow(` Cancelled:         ${String(periodStats.cancelled).padStart(4)} (${(periodStats.total > 0 ? (periodStats.cancelled / periodStats.total * 100) : 0).toFixed(1)}%)`.padEnd(65)) + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + chalk.blue(` Open:              ${String(periodStats.open).padStart(4)}`.padEnd(65)) + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + '                                                                 ' + chalk.bold.cyan('│'));
      
      const winRateColor = winRate >= 60 ? chalk.green : winRate >= 50 ? chalk.yellow : chalk.red;
      console.log(chalk.bold.cyan('│') + winRateColor(` Win Rate:          ${winRate.toFixed(1)}% (${periodStats.won}W / ${resolved} resolved)`.padEnd(65)) + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + '                                                                 ' + chalk.bold.cyan('│'));
      
      // P&L section
      console.log(chalk.bold.cyan('│') + chalk.bold.white(' PROFIT & LOSS                                                   ') + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + chalk.gray(' ─────────────                                                   ') + chalk.bold.cyan('│'));
      
      const pnlColor = periodStats.totalPnl >= 0 ? chalk.green : chalk.red;
      const pnlSign = periodStats.totalPnl >= 0 ? '+' : '';
      console.log(chalk.bold.cyan('│') + pnlColor(` Total P&L:         ${pnlSign}${formatUSD(periodStats.totalPnl)}`.padEnd(65)) + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + chalk.white(` Starting Balance:  ${formatUSD(CONFIG.INITIAL_PAPER_BALANCE)}`.padEnd(65)) + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + chalk.white(` Current Balance:   ${formatUSD(currentBalance)}`.padEnd(65)) + chalk.bold.cyan('│'));
      
      const roiColor = roi >= 0 ? chalk.green : chalk.red;
      const roiSign = roi >= 0 ? '+' : '';
      console.log(chalk.bold.cyan('│') + roiColor(` ROI:               ${roiSign}${roi.toFixed(1)}%`.padEnd(65)) + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + '                                                                 ' + chalk.bold.cyan('│'));
      
      if (periodStats.bestTrade && periodStats.bestTrade.pnl) {
        const bestPnl = periodStats.bestTrade.pnl;
        const bestTitle = periodStats.bestTrade.market_title.length > 30 
          ? periodStats.bestTrade.market_title.substring(0, 27) + '...' 
          : periodStats.bestTrade.market_title;
        console.log(chalk.bold.cyan('│') + chalk.green(` Best Trade:        +${formatUSD(bestPnl)} (${bestTitle})`.padEnd(65)) + chalk.bold.cyan('│'));
      }
      
      if (periodStats.worstTrade && periodStats.worstTrade.pnl && periodStats.worstTrade.pnl < 0) {
        const worstPnl = periodStats.worstTrade.pnl;
        const worstTitle = periodStats.worstTrade.market_title.length > 30 
          ? periodStats.worstTrade.market_title.substring(0, 27) + '...' 
          : periodStats.worstTrade.market_title;
        console.log(chalk.bold.cyan('│') + chalk.red(` Worst Trade:       ${formatUSD(worstPnl)} (${worstTitle})`.padEnd(65)) + chalk.bold.cyan('│'));
      }
      
      console.log(chalk.bold.cyan('│') + '                                                                 ' + chalk.bold.cyan('│'));
      
      // Wallet tracking section
      console.log(chalk.bold.cyan('│') + chalk.bold.white(' WALLET TRACKING                                                 ') + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + chalk.gray(' ─────────────                                                   ') + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + chalk.white(` Wallets Watched:   ${String(wallets.length).padStart(4)}`.padEnd(65)) + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + chalk.white(` Wallet Trades:     ${String(walletTrades.count).padStart(4)}`.padEnd(65)) + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + chalk.white(` Resolved:          ${String(resolvedTrades.count).padStart(4)}`.padEnd(65)) + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('│') + chalk.white(` Archived:          ${String(archivedTrades.count).padStart(4)}`.padEnd(65)) + chalk.bold.cyan('│'));
      
      console.log(chalk.bold.cyan('└─────────────────────────────────────────────────────────────────┘'));
      console.log();
      
      // Verbose mode: show recent trades
      if (options.verbose && periodStats.total > 0) {
        console.log(chalk.bold.white('Recent Trades:'));
        console.log(chalk.gray('─'.repeat(65)));
        
        const recentTrades = filteredTrades.slice(0, 10);
        for (const trade of recentTrades) {
          const statusColor = trade.status === 'WON' ? chalk.green : 
                             trade.status === 'LOST' ? chalk.red : 
                             trade.status === 'CANCELLED' ? chalk.yellow : chalk.blue;
          const pnl = trade.pnl ? ` | ${trade.pnl >= 0 ? '+' : ''}${formatUSD(trade.pnl)}` : '';
          const title = trade.market_title.length > 35 ? trade.market_title.substring(0, 32) + '...' : trade.market_title;
          console.log(`${statusColor(trade.status.padEnd(10))} ${chalk.white(title)}${chalk.gray(pnl)}`);
        }
        console.log();
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('Error fetching stats:'), errorMessage);
      process.exit(1);
    }
  });
