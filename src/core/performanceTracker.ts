import { db } from '../models/database.js';
import { getPaperTradeStats } from '../models/paperTrade.js';
import { getAllWatchedWallets } from '../models/wallet.js';
import { logger } from '../utils/logger.js';

export interface PerformanceMetrics {
  date: string;
  totalSignals: number;
  tradesExecuted: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  bestTradePnl: number;
  worstTradePnl: number;
  winRate: number;
  avgPnl: number;
}

/**
 * Performance Tracker
 * Tracks and analyzes bot performance
 */
export class PerformanceTracker {
  private signalsToday = 0;

  /**
   * Record a signal generated
   */
  recordSignal(): void {
    this.signalsToday++;
  }

  /**
   * Update daily performance metrics
   */
  updateDailyMetrics(): void {
    const today = new Date().toISOString().split('T')[0];
    const stats = getPaperTradeStats();

    const stmt = db.prepare(`
      INSERT INTO performance (
        date, total_signals, trades_executed, winning_trades, 
        losing_trades, total_pnl, best_trade_pnl, worst_trade_pnl
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        total_signals = excluded.total_signals,
        trades_executed = excluded.trades_executed,
        winning_trades = excluded.winning_trades,
        losing_trades = excluded.losing_trades,
        total_pnl = excluded.total_pnl,
        best_trade_pnl = excluded.best_trade_pnl,
        worst_trade_pnl = excluded.worst_trade_pnl
    `);

    stmt.run(
      today,
      this.signalsToday,
      stats.completed,
      stats.winning,
      stats.losing,
      stats.total_pnl,
      stats.best_pnl,
      stats.worst_pnl
    );

    logger.info(`Daily metrics updated for ${today}`);
  }

  /**
   * Get today's performance
   */
  getTodayPerformance(): PerformanceMetrics | null {
    const today = new Date().toISOString().split('T')[0];
    
    const stmt = db.prepare('SELECT * FROM performance WHERE date = ?');
    const row = stmt.get(today) as any;

    if (!row) return null;

    const totalTrades = row.winning_trades + row.losing_trades;
    const winRate = totalTrades > 0 ? row.winning_trades / totalTrades : 0;
    const avgPnl = totalTrades > 0 ? row.total_pnl / totalTrades : 0;

    return {
      date: row.date,
      totalSignals: row.total_signals,
      tradesExecuted: row.trades_executed,
      winningTrades: row.winning_trades,
      losingTrades: row.losing_trades,
      totalPnl: row.total_pnl,
      bestTradePnl: row.best_trade_pnl,
      worstTradePnl: row.worst_trade_pnl,
      winRate,
      avgPnl,
    };
  }

  /**
   * Get performance over last N days
   */
  getPerformanceHistory(days = 7): PerformanceMetrics[] {
    const stmt = db.prepare(`
      SELECT * FROM performance 
      ORDER BY date DESC 
      LIMIT ?
    `);
    
    const rows = stmt.all(days) as any[];

    return rows.map(row => {
      const totalTrades = row.winning_trades + row.losing_trades;
      const winRate = totalTrades > 0 ? row.winning_trades / totalTrades : 0;
      const avgPnl = totalTrades > 0 ? row.total_pnl / totalTrades : 0;

      return {
        date: row.date,
        totalSignals: row.total_signals,
        tradesExecuted: row.trades_executed,
        winningTrades: row.winning_trades,
        losingTrades: row.losing_trades,
        totalPnl: row.total_pnl,
        bestTradePnl: row.best_trade_pnl,
        worstTradePnl: row.worst_trade_pnl,
        winRate,
        avgPnl,
      };
    });
  }

  /**
   * Get overall statistics
   */
  getOverallStats() {
    const stats = getPaperTradeStats();
    const wallets = getAllWatchedWallets();

    return {
      totalWalletsWatched: wallets.length,
      whaleWallets: wallets.filter(w => w.is_whale).length,
      newSuspiciousWallets: wallets.filter(w => w.is_new_suspicious).length,
      totalPaperTrades: stats.total,
      openPositions: stats.open,
      completedTrades: stats.completed,
      winningTrades: stats.winning,
      losingTrades: stats.losing,
      winRate: stats.winRate,
      totalPnl: stats.total_pnl,
      avgPnl: stats.avg_pnl,
      bestTrade: stats.best_pnl,
      worstTrade: stats.worst_pnl,
    };
  }

  /**
   * Reset daily signal counter
   */
  resetDailyCounter(): void {
    this.signalsToday = 0;
  }
}

export const performanceTracker = new PerformanceTracker();
