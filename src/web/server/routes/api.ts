import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../../../utils/logger.js';
import { getPaperTradeStats, getAllPaperTrades, getOpenPaperTrades, getOpenPositionsTotalAmount as getPaperOpenAmount, closePaperTrade, getPaperTradeById } from '../../../models/paperTrade.js';
import { getAllWatchedWallets, getWalletStats, getWallet } from '../../../models/wallet.js';
import { getWalletTrades, getRecentWalletTrades } from '../../../models/trade.js';
import { getDatabaseStats } from '../../../models/database.js';
import { performanceTracker } from '../../../core/performanceTracker.js';
import { getAllRealTrades, getRealTradeStats, cancelRealTrade, getOpenPositionsTotalAmount as getRealOpenAmount, getRealTradeById, closeRealTrade } from '../../../models/realTrade.js';
import { clobClient } from '../../../services/polymarket/clobClient.js';
import { getMarketPrices } from '../../../services/polymarket/tokenResolver.js';
import { Side } from '@polymarket/clob-client';
import { CONFIG } from '../../../config/settings.js';
import { isKillSwitchActivated } from '../../../core/killSwitch.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * Unified order type for paper and real trades
 */
interface UnifiedOrder {
  id: string;
  type: 'paper' | 'real';
  marketTitle: string;
  outcome: string;
  entryPrice: number;
  exitPrice: number | null;
  amount: number;
  shares: number;
  status: string;
  pnl: number | null;
  timestamp: string;
  confidenceScore: number;
  triggeredBy: string;
  orderId?: string;
  orderType?: string;
  feePaid?: number;
  transactionHash?: string;
}

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
    
    // Calculate total amount in open positions
    const paperOpenAmount = getPaperOpenAmount();
    const realOpenAmount = CONFIG.REAL_TRADING_ENABLED ? getRealOpenAmount() : 0;
    const totalOpenAmount = paperOpenAmount + realOpenAmount;
    
    res.json({
      portfolio: {
        balance: currentBalance,
        startingBalance: INITIAL_BALANCE,
        pnl: paperStats.total_pnl,
        pnlPercent: ((paperStats.total_pnl / INITIAL_BALANCE) * 100).toFixed(2),
        roi: ((paperStats.total_pnl / INITIAL_BALANCE) * 100).toFixed(2),
        openPositionsValue: totalOpenAmount,
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

/**
 * GET /api/orders/stats
 * Get order statistics for all types
 * IMPORTANT: Must be defined BEFORE /orders/:id
 */
router.get('/orders/stats', (req: Request, res: Response) => {
  try {
    const paperStats = getPaperTradeStats();
    const realStats = CONFIG.REAL_TRADING_ENABLED ? getRealTradeStats() : null;
    
    // Calculate total amount in open positions
    const paperOpenAmount = getPaperOpenAmount();
    const realOpenAmount = CONFIG.REAL_TRADING_ENABLED ? getRealOpenAmount() : 0;
    const totalOpenAmount = paperOpenAmount + realOpenAmount;
    
    res.json({
      paper: {
        total: paperStats.total,
        open: paperStats.open,
        won: paperStats.winning,
        lost: paperStats.losing,
        cancelled: paperStats.cancelled,
        openAmount: paperOpenAmount,
      },
      real: realStats ? {
        total: realStats.total,
        pending: realStats.pending,
        open: realStats.open,
        won: realStats.winning,
        lost: realStats.losing,
        cancelled: realStats.cancelled,
        failed: realStats.failed,
        openAmount: realOpenAmount,
      } : null,
      combined: {
        total: paperStats.total + (realStats?.total || 0),
        open: paperStats.open + (realStats?.open || 0),
        pending: realStats?.pending || 0,
        openAmount: totalOpenAmount,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching order stats: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to fetch order stats' });
  }
});

/**
 * GET /api/orders
 * List all orders (paper + real) with unified format
 */
router.get('/orders', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const type = req.query.type as string; // 'paper' | 'real' | 'all'
    const status = req.query.status as string;
    
    let orders: UnifiedOrder[] = [];
    
    // Fetch paper trades
    if (!type || type === 'all' || type === 'paper') {
      const paperTrades = getAllPaperTrades(limit);
      orders.push(...paperTrades.map(t => ({
        id: t.id,
        type: 'paper' as const,
        marketTitle: t.market_title,
        outcome: t.outcome,
        entryPrice: t.entry_price,
        exitPrice: t.exit_price ?? null,
        amount: t.virtual_amount,
        shares: t.shares,
        status: t.status,
        pnl: t.pnl ?? null,
        timestamp: t.timestamp,
        confidenceScore: t.confidence_score,
        triggeredBy: t.triggered_by,
      })));
    }
    
    // Fetch real trades
    if (CONFIG.REAL_TRADING_ENABLED && (!type || type === 'all' || type === 'real')) {
      const realTrades = getAllRealTrades(limit);
      orders.push(...realTrades.map(t => ({
        id: t.id,
        type: 'real' as const,
        marketTitle: t.market_title,
        outcome: t.outcome,
        orderId: t.order_id,
        orderType: t.order_type,
        entryPrice: t.entry_price,
        exitPrice: t.exit_price ?? null,
        amount: t.amount_usd,
        shares: t.shares,
        status: t.status,
        pnl: t.pnl ?? null,
        feePaid: t.fee_paid,
        transactionHash: t.transaction_hash,
        timestamp: t.timestamp,
        confidenceScore: t.confidence_score,
        triggeredBy: t.triggered_by,
      })));
    }
    
    // Filter by status if provided
    if (status) {
      orders = orders.filter(o => o.status === status.toUpperCase());
    }
    
    // Sort by timestamp
    orders.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // Limit results
    orders = orders.slice(0, limit);
    
    res.json({
      orders,
      count: orders.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching orders: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * GET /api/orders/:id
 * Get single order details
 */
router.get('/orders/:id', (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    
    // Try to find in paper trades
    const paperTrades = getAllPaperTrades(1000);
    const paperTrade = paperTrades.find(t => t.id === orderId);
    
    if (paperTrade) {
      res.json({
        ...paperTrade,
        type: 'paper',
      });
      return;
    }
    
    // Try to find in real trades
    if (CONFIG.REAL_TRADING_ENABLED) {
      const realTrades = getAllRealTrades(1000);
      const realTrade = realTrades.find(t => t.id === orderId);
      
      if (realTrade) {
        res.json({
          ...realTrade,
          type: 'real',
        });
        return;
      }
    }
    
    res.status(404).json({ error: 'Order not found' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching order: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

/**
 * POST /api/orders/:id/cancel
 * Cancel a real order (paper trades cannot be cancelled via API)
 */
router.post('/orders/:id/cancel', async (req: Request, res: Response) => {
  try {
    if (!CONFIG.REAL_TRADING_ENABLED) {
      res.status(400).json({ error: 'Real trading not enabled' });
      return;
    }
    
    // Check kill switch
    if (isKillSwitchActivated()) {
      res.status(403).json({ error: 'Kill switch is activated - all trading operations blocked' });
      return;
    }
    
    const tradeId = req.params.id as string;
    
    // Find the real trade
    const realTrades = getAllRealTrades(1000);
    const realTrade = realTrades.find(t => t.id === tradeId);
    
    if (!realTrade) {
      res.status(404).json({ error: 'Real trade not found' });
      return;
    }
    
    if (!realTrade.order_id) {
      res.status(400).json({ error: 'Trade has no order ID (not yet placed)' });
      return;
    }
    
    if (realTrade.status !== 'OPEN' && realTrade.status !== 'PENDING') {
      res.status(400).json({ error: `Cannot cancel order with status: ${realTrade.status}` });
      return;
    }
    
    // Cancel on CLOB
    await clobClient.cancelOrder(realTrade.order_id);
    
    // Update database
    cancelRealTrade(tradeId);
    
    logger.info(`Order ${realTrade.order_id} cancelled via API`);
    
    res.json({
      success: true,
      message: 'Order cancelled successfully',
      orderId: realTrade.order_id,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error cancelling order: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

/**
 * POST /api/orders/:id/close
 * Close an open position (paper or real)
 */
router.post('/orders/:id/close', async (req: Request, res: Response) => {
  try {
    const tradeId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { type, sellType, limitPrice } = req.body as {
      type: 'paper' | 'real';
      sellType?: 'market' | 'limit';
      limitPrice?: number;
    };
    
    if (!type || (type !== 'paper' && type !== 'real')) {
      res.status(400).json({ error: 'Invalid type. Must be "paper" or "real"' });
      return;
    }
    
    if (type === 'paper') {
      // Close paper trade
      const trade = getPaperTradeById(tradeId);
      
      if (!trade) {
        res.status(404).json({ error: 'Paper trade not found' });
        return;
      }
      
      if (trade.status !== 'OPEN') {
        res.status(400).json({ error: `Cannot close trade with status: ${trade.status}` });
        return;
      }
      
      // Fetch current market price
      const prices = await getMarketPrices(trade.market_id);
      const currentPrice = prices.get(trade.outcome);
      
      if (currentPrice === undefined) {
        res.status(500).json({ error: 'Failed to fetch current market price' });
        return;
      }
      
      // Calculate P&L
      const exitPrice = currentPrice;
      const pnl = (exitPrice - trade.entry_price) * trade.shares;
      
      // Close the trade
      closePaperTrade(tradeId, exitPrice, pnl);
      
      logger.info(`Paper trade ${tradeId} closed at price ${exitPrice.toFixed(4)}, P&L: $${pnl.toFixed(2)}`);
      
      res.json({
        success: true,
        message: 'Paper trade closed successfully',
        exitPrice,
        pnl,
      });
      
    } else {
      // Close real trade
      if (!CONFIG.REAL_TRADING_ENABLED) {
        res.status(400).json({ error: 'Real trading is not enabled' });
        return;
      }
      
      // Check kill switch
      if (isKillSwitchActivated()) {
        res.status(403).json({ error: 'Kill switch is activated - all trading operations blocked' });
        return;
      }
      
      const trade = getRealTradeById(tradeId);
      
      if (!trade) {
        res.status(404).json({ error: 'Real trade not found' });
        return;
      }
      
      if (trade.status !== 'OPEN') {
        res.status(400).json({ error: `Cannot close trade with status: ${trade.status}` });
        return;
      }
      
      if (!trade.token_id) {
        res.status(400).json({ error: 'Trade missing token ID' });
        return;
      }
      
      // Validate sell type
      if (!sellType || (sellType !== 'market' && sellType !== 'limit')) {
        res.status(400).json({ error: 'Invalid sellType. Must be "market" or "limit"' });
        return;
      }
      
      if (sellType === 'limit' && (limitPrice === undefined || limitPrice <= 0)) {
        res.status(400).json({ error: 'Limit price required for limit orders' });
        return;
      }
      
      // Place sell order on CLOB
      let result;
      
      if (sellType === 'market') {
        logger.info(`Placing market sell order for ${trade.shares} shares of ${trade.market_title}`);
        result = await clobClient.placeMarketOrder({
          tokenID: trade.token_id,
          price: 0, // Market orders don't need price
          size: trade.shares,
          side: Side.SELL,
        });
      } else {
        logger.info(`Placing limit sell order for ${trade.shares} shares @ $${limitPrice} of ${trade.market_title}`);
        result = await clobClient.placeLimitOrder({
          tokenID: trade.token_id,
          price: limitPrice!,
          size: trade.shares,
          side: Side.SELL,
        });
      }
      
      // Fetch current price for immediate P&L calculation (if market order)
      let currentPrice: number | undefined;
      let pnl: number | undefined;
      
      if (sellType === 'market') {
        const prices = await getMarketPrices(trade.market_id);
        currentPrice = prices.get(trade.outcome);
        
        if (currentPrice !== undefined) {
          pnl = (currentPrice - trade.entry_price) * trade.shares;
        }
      } else if (limitPrice !== undefined) {
        // For limit orders, use the limit price for estimated P&L
        currentPrice = limitPrice;
        pnl = (limitPrice - trade.entry_price) * trade.shares;
      }
      
      // Update database with exit order info
      // Note: For limit orders, P&L won't be final until order fills
      if (currentPrice !== undefined && pnl !== undefined) {
        closeRealTrade(tradeId, currentPrice, pnl, result.orderID, result.transactionHash);
      } else {
        // If we can't calculate P&L yet, just store the exit order info
        // We'll update P&L when the order fills (handled by orderStatusMonitor)
        closeRealTrade(tradeId, 0, 0, result.orderID, result.transactionHash);
      }
      
      logger.info(`Real trade ${tradeId} sell order placed: ${result.orderID}`);
      
      res.json({
        success: true,
        message: `${sellType === 'market' ? 'Market' : 'Limit'} sell order placed successfully`,
        exitOrderId: result.orderID,
        transactionHash: result.transactionHash,
        exitPrice: currentPrice,
        pnl,
      });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error closing position: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to close position' });
  }
});

export default router;
