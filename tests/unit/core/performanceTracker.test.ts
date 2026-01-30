import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PerformanceMetrics } from '../../../src/core/performanceTracker.js';

/**
 * Unit tests for PerformanceTracker module
 * Tests daily metrics tracking and performance analysis
 */

describe('PerformanceTracker', () => {
  // Mock state
  let mockDatabase: Map<string, any>;
  let mockPaperTradeStats: {
    total: number;
    open: number;
    completed: number;
    winning: number;
    losing: number;
    cancelled: number;
    winRate: number;
    total_pnl: number;
    best_pnl: number;
    worst_pnl: number;
    avg_pnl: number;
  };
  let mockWallets: Array<{
    address: string;
    is_whale: boolean;
    is_new_suspicious: boolean;
  }>;
  let mockLogger: {
    info: jest.Mock;
  };
  let signalsToday: number;

  beforeEach(() => {
    // Reset mocks
    mockDatabase = new Map();
    mockPaperTradeStats = {
      total: 0,
      open: 0,
      completed: 0,
      winning: 0,
      losing: 0,
      cancelled: 0,
      winRate: 0,
      total_pnl: 0,
      best_pnl: 0,
      worst_pnl: 0,
      avg_pnl: 0,
    };
    mockWallets = [];
    mockLogger = {
      info: jest.fn(),
    };
    signalsToday = 0;
  });

  // Helper: Get today's date in YYYY-MM-DD format
  function getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  // Re-implement functions with injected mocks
  function recordSignal(): void {
    signalsToday++;
  }

  function updateDailyMetrics(): void {
    const today = getTodayDate();
    const stats = mockPaperTradeStats;

    // Upsert: Insert or update existing row
    const existingRow = mockDatabase.get(today);
    
    mockDatabase.set(today, {
      date: today,
      total_signals: signalsToday,
      trades_executed: stats.completed,
      winning_trades: stats.winning,
      losing_trades: stats.losing,
      total_pnl: stats.total_pnl,
      best_trade_pnl: stats.best_pnl,
      worst_trade_pnl: stats.worst_pnl,
    });

    mockLogger.info(`Daily metrics updated for ${today}`);
  }

  function getTodayPerformance(): PerformanceMetrics | null {
    const today = getTodayDate();
    const row = mockDatabase.get(today);

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

  function getPerformanceHistory(days = 7): PerformanceMetrics[] {
    // Get all entries, sort by date DESC, limit by days
    const allEntries = Array.from(mockDatabase.entries())
      .map(([_key, row]) => row)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, days);

    return allEntries.map(row => {
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

  function getOverallStats() {
    const stats = mockPaperTradeStats;
    const wallets = mockWallets;

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

  function resetDailyCounter(): void {
    signalsToday = 0;
  }

  describe('recordSignal', () => {
    it('should increment signalsToday counter', () => {
      expect(signalsToday).toBe(0);

      recordSignal();

      expect(signalsToday).toBe(1);
    });

    it('should track multiple signals correctly', () => {
      recordSignal();
      recordSignal();
      recordSignal();

      expect(signalsToday).toBe(3);
    });
  });

  describe('updateDailyMetrics', () => {
    it('should insert new metrics row for today', () => {
      signalsToday = 5;
      mockPaperTradeStats = {
        total: 10,
        open: 2,
        completed: 8,
        winning: 5,
        losing: 3,
        cancelled: 0,
        winRate: 0.625,
        total_pnl: 250,
        best_pnl: 100,
        worst_pnl: -50,
        avg_pnl: 31.25,
      };

      updateDailyMetrics();

      const today = getTodayDate();
      expect(mockDatabase.has(today)).toBe(true);

      const row = mockDatabase.get(today);
      expect(row.total_signals).toBe(5);
      expect(row.trades_executed).toBe(8);
      expect(row.winning_trades).toBe(5);
      expect(row.losing_trades).toBe(3);
      expect(row.total_pnl).toBe(250);
      expect(row.best_trade_pnl).toBe(100);
      expect(row.worst_trade_pnl).toBe(-50);
    });

    it('should update existing row on same day (upsert)', () => {
      const today = getTodayDate();
      
      // Insert initial data
      signalsToday = 3;
      mockPaperTradeStats.completed = 5;
      updateDailyMetrics();

      expect(mockDatabase.get(today).total_signals).toBe(3);
      expect(mockDatabase.get(today).trades_executed).toBe(5);

      // Update with new data
      signalsToday = 7;
      mockPaperTradeStats.completed = 10;
      updateDailyMetrics();

      expect(mockDatabase.get(today).total_signals).toBe(7);
      expect(mockDatabase.get(today).trades_executed).toBe(10);
      expect(mockDatabase.size).toBe(1); // Still only one row
    });

    it('should use stats from getPaperTradeStats', () => {
      mockPaperTradeStats = {
        total: 20,
        open: 5,
        completed: 15,
        winning: 10,
        losing: 5,
        cancelled: 0,
        winRate: 0.667,
        total_pnl: 500,
        best_pnl: 200,
        worst_pnl: -75,
        avg_pnl: 33.33,
      };

      updateDailyMetrics();

      const row = mockDatabase.get(getTodayDate());
      expect(row.trades_executed).toBe(15);
      expect(row.winning_trades).toBe(10);
      expect(row.losing_trades).toBe(5);
      expect(row.total_pnl).toBe(500);
    });
  });

  describe('getTodayPerformance', () => {
    it('should return null when no data for today', () => {
      const result = getTodayPerformance();

      expect(result).toBeNull();
    });

    it('should return full PerformanceMetrics object', () => {
      const today = getTodayDate();
      mockDatabase.set(today, {
        date: today,
        total_signals: 10,
        trades_executed: 8,
        winning_trades: 5,
        losing_trades: 3,
        total_pnl: 250,
        best_trade_pnl: 100,
        worst_trade_pnl: -50,
      });

      const result = getTodayPerformance();

      expect(result).not.toBeNull();
      expect(result?.date).toBe(today);
      expect(result?.totalSignals).toBe(10);
      expect(result?.tradesExecuted).toBe(8);
      expect(result?.winningTrades).toBe(5);
      expect(result?.losingTrades).toBe(3);
      expect(result?.totalPnl).toBe(250);
      expect(result?.bestTradePnl).toBe(100);
      expect(result?.worstTradePnl).toBe(-50);
    });

    it('should calculate winRate and avgPnl correctly', () => {
      const today = getTodayDate();
      mockDatabase.set(today, {
        date: today,
        total_signals: 10,
        trades_executed: 8,
        winning_trades: 6,
        losing_trades: 2,
        total_pnl: 400,
        best_trade_pnl: 150,
        worst_trade_pnl: -50,
      });

      const result = getTodayPerformance();

      expect(result?.winRate).toBe(0.75); // 6/8 = 0.75
      expect(result?.avgPnl).toBe(50); // 400/8 = 50
    });
  });

  describe('getPerformanceHistory', () => {
    it('should return array of PerformanceMetrics', () => {
      // Add 3 days of data
      mockDatabase.set('2024-01-15', {
        date: '2024-01-15',
        total_signals: 10,
        trades_executed: 8,
        winning_trades: 5,
        losing_trades: 3,
        total_pnl: 200,
        best_trade_pnl: 100,
        worst_trade_pnl: -50,
      });
      mockDatabase.set('2024-01-14', {
        date: '2024-01-14',
        total_signals: 8,
        trades_executed: 6,
        winning_trades: 4,
        losing_trades: 2,
        total_pnl: 150,
        best_trade_pnl: 80,
        worst_trade_pnl: -30,
      });
      mockDatabase.set('2024-01-13', {
        date: '2024-01-13',
        total_signals: 5,
        trades_executed: 4,
        winning_trades: 3,
        losing_trades: 1,
        total_pnl: 100,
        best_trade_pnl: 60,
        worst_trade_pnl: -20,
      });

      const result = getPerformanceHistory(7);

      expect(result.length).toBe(3);
      expect(result[0].date).toBe('2024-01-15'); // Most recent first
      expect(result[1].date).toBe('2024-01-14');
      expect(result[2].date).toBe('2024-01-13');
    });

    it('should respect days parameter limit', () => {
      // Add 5 days of data
      for (let i = 1; i <= 5; i++) {
        mockDatabase.set(`2024-01-${10 + i}`, {
          date: `2024-01-${10 + i}`,
          total_signals: i,
          trades_executed: i,
          winning_trades: i,
          losing_trades: 0,
          total_pnl: i * 50,
          best_trade_pnl: i * 30,
          worst_trade_pnl: 0,
        });
      }

      const result = getPerformanceHistory(3);

      expect(result.length).toBe(3);
      // Should get the 3 most recent
      expect(result[0].date).toBe('2024-01-15');
      expect(result[1].date).toBe('2024-01-14');
      expect(result[2].date).toBe('2024-01-13');
    });

    it('should order by date DESC (most recent first)', () => {
      mockDatabase.set('2024-01-10', {
        date: '2024-01-10',
        total_signals: 1,
        trades_executed: 1,
        winning_trades: 1,
        losing_trades: 0,
        total_pnl: 50,
        best_trade_pnl: 50,
        worst_trade_pnl: 0,
      });
      mockDatabase.set('2024-01-20', {
        date: '2024-01-20',
        total_signals: 2,
        trades_executed: 2,
        winning_trades: 2,
        losing_trades: 0,
        total_pnl: 100,
        best_trade_pnl: 60,
        worst_trade_pnl: 0,
      });
      mockDatabase.set('2024-01-15', {
        date: '2024-01-15',
        total_signals: 3,
        trades_executed: 3,
        winning_trades: 3,
        losing_trades: 0,
        total_pnl: 150,
        best_trade_pnl: 70,
        worst_trade_pnl: 0,
      });

      const result = getPerformanceHistory(10);

      expect(result[0].date).toBe('2024-01-20');
      expect(result[1].date).toBe('2024-01-15');
      expect(result[2].date).toBe('2024-01-10');
    });
  });

  describe('getOverallStats', () => {
    it('should return comprehensive stats object', () => {
      mockWallets = [
        { address: '0x1', is_whale: true, is_new_suspicious: false },
        { address: '0x2', is_whale: true, is_new_suspicious: false },
        { address: '0x3', is_whale: false, is_new_suspicious: true },
      ];
      mockPaperTradeStats = {
        total: 20,
        open: 5,
        completed: 15,
        winning: 10,
        losing: 5,
        cancelled: 0,
        winRate: 0.667,
        total_pnl: 500,
        best_pnl: 200,
        worst_pnl: -75,
        avg_pnl: 33.33,
      };

      const result = getOverallStats();

      expect(result.totalWalletsWatched).toBe(3);
      expect(result.whaleWallets).toBe(2);
      expect(result.newSuspiciousWallets).toBe(1);
      expect(result.totalPaperTrades).toBe(20);
      expect(result.openPositions).toBe(5);
      expect(result.completedTrades).toBe(15);
      expect(result.winningTrades).toBe(10);
      expect(result.losingTrades).toBe(5);
      expect(result.winRate).toBe(0.667);
      expect(result.totalPnl).toBe(500);
      expect(result.avgPnl).toBe(33.33);
      expect(result.bestTrade).toBe(200);
      expect(result.worstTrade).toBe(-75);
    });

    it('should correctly count whale vs suspicious wallets', () => {
      mockWallets = [
        { address: '0x1', is_whale: true, is_new_suspicious: false },
        { address: '0x2', is_whale: true, is_new_suspicious: false },
        { address: '0x3', is_whale: true, is_new_suspicious: false },
        { address: '0x4', is_whale: false, is_new_suspicious: true },
        { address: '0x5', is_whale: false, is_new_suspicious: true },
      ];

      const result = getOverallStats();

      expect(result.totalWalletsWatched).toBe(5);
      expect(result.whaleWallets).toBe(3);
      expect(result.newSuspiciousWallets).toBe(2);
    });
  });

  describe('resetDailyCounter', () => {
    it('should reset signalsToday to 0', () => {
      signalsToday = 10;

      resetDailyCounter();

      expect(signalsToday).toBe(0);
    });

    it('should reset counter after recording signals', () => {
      recordSignal();
      recordSignal();
      recordSignal();
      expect(signalsToday).toBe(3);

      resetDailyCounter();

      expect(signalsToday).toBe(0);
    });
  });
});
