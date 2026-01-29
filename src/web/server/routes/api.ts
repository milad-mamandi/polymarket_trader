import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../../../utils/logger.js';
import { getPaperTradeStats, getAllPaperTrades, getOpenPaperTrades } from '../../../models/paperTrade.js';
import { getAllWatchedWallets, getWalletStats, getWallet } from '../../../models/wallet.js';
import { getWalletTrades, getRecentWalletTrades } from '../../../models/trade.js';
import { getDatabaseStats } from '../../../models/database.js';
import { performanceTracker } from '../../../core/performanceTracker.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/stats/overview
 * Get portfolio overview and key metrics
 */
router.get('/stats/overview', async (req: Request, res: Response) => {
  try {
    const paperStats = getPaperTradeStats();
    const dbStats = getDatabaseStats();
    const performance = await performanceTracker.getOverallStats();
    
    // Calculate portfolio values
    const INITIAL_BALANCE = 10000; // From CONFIG
    const currentBalance = INITIAL_BALANCE + paperStats.total_pnl;
    
    res.json({
      portfolio: {
        balance: currentBalance,
        startingBalance: INITIAL_BALANCE,
        pnl: paperStats.total_pnl,
        pnlPercent: ((paperStats.total_pnl / INITIAL_BALANCE) * 100).toFixed(2),
        roi: ((paperStats.total_pnl / INITIAL_BALANCE) * 100).toFixed(2),
      },
      trades: {
        total: paperStats.total,
        open: paperStats.open,
        won: paperStats.winning,
        lost: paperStats.losing,
        cancelled: paperStats.cancelled,
        winRate: paperStats.winRate * 100,
      },
      wallets: {
        total: dbStats.totalWallets,
        totalTrades: dbStats.totalWalletTrades,
      },
      performance: {
        bestTrade: paperStats.best_pnl,
        worstTrade: paperStats.worst_pnl,
        avgWin: paperStats.avg_pnl,
        avgLoss: paperStats.avg_pnl,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching overview: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

/**
 * GET /api/stats/performance
 * Get performance metrics over time
 */
router.get('/stats/performance', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const history = await performanceTracker.getPerformanceHistory(days);
    
    res.json({
      history,
      period: days,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching performance: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to fetch performance' });
  }
});

/**
 * GET /api/stats/daily
 * Get today's statistics
 */
router.get('/stats/daily', async (req: Request, res: Response) => {
  try {
    const today = await performanceTracker.getTodayPerformance();
    
    res.json(today);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching daily stats: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to fetch daily stats' });
  }
});

/**
 * GET /api/trades/stats
 * Get trade statistics
 * IMPORTANT: Must be defined BEFORE /trades/:id to prevent "stats" from being treated as an ID
 */
router.get('/trades/stats', (req: Request, res: Response) => {
  try {
    const stats = getPaperTradeStats();
    res.json(stats);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching trade stats: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to fetch trade stats' });
  }
});

/**
 * GET /api/trades
 * List paper trades with optional filters
 */
router.get('/trades', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as string;
    
    let trades = getAllPaperTrades(limit);
    
    // Filter by status if provided
    if (status && ['OPEN', 'WON', 'LOST', 'CANCELLED'].includes(status)) {
      trades = trades.filter(t => t.status === status);
    }
    
    res.json({
      trades,
      count: trades.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching trades: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

/**
 * GET /api/trades/:id
 * Get single trade details
 */
router.get('/trades/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const allTrades = getAllPaperTrades(1000);
    const trade = allTrades.find(t => t.id === id);
    
    if (!trade) {
      res.status(404).json({ error: 'Trade not found' });
      return;
    }
    
    res.json(trade);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching trade: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to fetch trade' });
  }
});

/**
 * GET /api/wallets/stats
 * Get wallet statistics
 * IMPORTANT: Must be defined BEFORE /wallets/:address to prevent "stats" from being treated as an address
 */
router.get('/wallets/stats', (req: Request, res: Response) => {
  try {
    const wallets = getAllWatchedWallets();
    const whales = wallets.filter(w => w.is_whale);
    const suspicious = wallets.filter(w => w.is_new_suspicious);
    
    res.json({
      total: wallets.length,
      whales: whales.length,
      suspicious: suspicious.length,
      totalVolume: wallets.reduce((sum, w) => sum + (w.total_volume || 0), 0),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching wallet stats: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to fetch wallet stats' });
  }
});

/**
 * GET /api/wallets
 * List watched wallets
 */
router.get('/wallets', (req: Request, res: Response) => {
  try {
    const wallets = getAllWatchedWallets();
    
    // Enrich with stats
    const enrichedWallets = wallets.map(wallet => {
      const stats = getWalletStats(wallet.address);
      return {
        ...wallet,
        ...stats,
      };
    });
    
    res.json({
      wallets: enrichedWallets,
      count: enrichedWallets.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching wallets: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
});

/**
 * GET /api/wallets/:address
 * Get wallet details with trades
 */
router.get('/wallets/:address', (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;
    const wallet = getWallet(address);
    
    if (!wallet) {
      res.status(404).json({ error: 'Wallet not found' });
      return;
    }
    
    const stats = getWalletStats(address);
    const trades = getWalletTrades(address, 100);
    
    res.json({
      wallet: {
        ...wallet,
        ...stats,
      },
      trades,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching wallet: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to fetch wallet' });
  }
});

/**
 * GET /api/activity/recent
 * Get recent activity (trades, detections, etc.)
 */
router.get('/activity/recent', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const recentTrades = getRecentWalletTrades(limit);
    const recentPaperTrades = getAllPaperTrades(limit);
    
    // Combine and sort by timestamp
    const activity = [
      ...recentTrades.map(t => ({
        type: 'wallet_trade',
        timestamp: t.timestamp,
        data: t,
      })),
      ...recentPaperTrades.map(t => ({
        type: 'paper_trade',
        timestamp: t.timestamp,
        data: t,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
    
    res.json({
      activity,
      count: activity.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching activity: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

export default router;
