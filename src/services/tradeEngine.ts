import { BetRating } from './betRater.js';
import { Trade } from './polymarket/types.js';
import { insertPaperTrade, getOpenPaperTrades, getPaperTradeStats } from '../models/paperTrade.js';
import { CONFIG } from '../config/settings.js';
import { logger, logTrade } from '../utils/logger.js';
import { generateId, formatUSD, timeAgo, truncateAddress } from '../utils/helpers.js';
import { getWalletStats } from '../models/wallet.js';
import { getWebSocketManager } from '../index.js';
import { executeRealTrade } from './realTradeExecutor.js';

export interface PaperTradeResult {
  executed: boolean;
  tradeId?: string;
  reason?: string;
  amount?: number;
  shares?: number;
}

export interface TradeResult extends PaperTradeResult {
  mode: 'paper' | 'real';
  orderId?: string;
}

/**
 * Paper Trading Engine
 * Executes virtual trades based on ratings
 */
export class TradeEngine {
  private paperBalance: number = CONFIG.INITIAL_PAPER_BALANCE;
  private initialized: boolean = false;

  /**
   * Initialize the trading engine
   */
  initialize(): void {
    if (this.initialized) return;

    // Calculate current balance from existing trades
    const stats = getPaperTradeStats();
    const openTrades = getOpenPaperTrades();
    const lockedCapital = openTrades.reduce((sum, t) => sum + t.virtual_amount, 0);
    
    // Correct formula: Initial balance + PnL from resolved trades - capital locked in open positions
    // This ensures that when the bot restarts, open positions are properly accounted for
    this.paperBalance = CONFIG.INITIAL_PAPER_BALANCE + stats.total_pnl - lockedCapital;

    logger.info(`Trade engine initialized. Balance: ${formatUSD(this.paperBalance)}, Locked: ${formatUSD(lockedCapital)}, Open positions: ${openTrades.length}`);
    this.initialized = true;
  }

  /**
   * Evaluate and potentially execute a trade (paper or real based on config)
   */
  async evaluateTrade(rating: BetRating): Promise<TradeResult> {
    this.ensureInitialized();

    // Check if rating meets threshold
    if (!rating.shouldTrade) {
      return {
        mode: CONFIG.TRADING_MODE,
        executed: false,
        reason: `Confidence too low: ${rating.finalScore}% < ${CONFIG.MIN_CONFIDENCE_FOR_TRADE}%`,
      };
    }

    // Route to appropriate execution method
    if (CONFIG.TRADING_MODE === 'real') {
      return await this.executeRealTrade(rating);
    } else {
      return await this.executePaperTrade(rating);
    }
  }

  /**
   * Execute a paper trade
   */
  private async executePaperTrade(rating: BetRating): Promise<TradeResult> {
    // Calculate position size (percentage of portfolio)
    const maxAmount = this.paperBalance * (CONFIG.MAX_POSITION_SIZE_PERCENT / 100);
    
    // Scale position size based on confidence
    // Higher confidence = larger position (up to max)
    const confidenceMultiplier = rating.finalScore / 100;
    const positionSize = maxAmount * confidenceMultiplier;

    // Check if we have enough balance
    if (positionSize > this.paperBalance) {
      return {
        mode: 'paper',
        executed: false,
        reason: `Insufficient balance: ${formatUSD(this.paperBalance)} < ${formatUSD(positionSize)}`,
      };
    }

    // Execute the paper trade
    const trade = rating.trade;
    const shares = positionSize / trade.price;
    const tradeId = generateId();

    insertPaperTrade({
      id: tradeId,
      triggered_by: rating.walletAddress,
      market_id: trade.conditionId,
      market_title: trade.title,
      outcome: trade.outcome,
      entry_price: trade.price,
      virtual_amount: positionSize,
      shares,
      confidence_score: rating.finalScore,
    });

    // Update balance
    this.paperBalance -= positionSize;

    // Log the trade
    this.logTradeExecution(rating, trade, positionSize, shares);

    logger.info(`✓ Paper trade executed: ${truncateAddress(rating.walletAddress)} | ${trade.outcome} @ ${trade.price} | ${formatUSD(positionSize)}`);

    // Broadcast new trade to WebSocket clients
    this.broadcastTradeUpdate(tradeId, rating, trade, positionSize, shares);

    return {
      mode: 'paper',
      executed: true,
      tradeId,
      amount: positionSize,
      shares,
    };
  }

  /**
   * Execute a real trade
   */
  private async executeRealTrade(rating: BetRating): Promise<TradeResult> {
    const trade = rating.trade;
    
    // Calculate position size using same logic as paper trading
    const maxAmount = CONFIG.INITIAL_PAPER_BALANCE * (CONFIG.MAX_POSITION_SIZE_PERCENT / 100);
    const confidenceMultiplier = rating.finalScore / 100;
    const positionSize = maxAmount * confidenceMultiplier;

    // Ensure position size doesn't exceed max real trading limit
    const amountUsd = Math.min(positionSize, CONFIG.REAL_TRADING_MAX_POSITION_USD);

    // Execute real trade via CLOB
    const result = await executeRealTrade({
      wallet: { address: rating.walletAddress, isWhale: true, isNewSuspicious: false, trade },
      marketId: trade.conditionId,
      marketTitle: trade.title,
      outcome: trade.outcome,
      amountUsd,
      confidence: rating.finalScore,
    });

    if (!result.success) {
      return {
        mode: 'real',
        executed: false,
        reason: result.error || 'Real trade execution failed',
      };
    }

    const shares = amountUsd / trade.price;

    // Log the trade
    this.logTradeExecution(rating, trade, amountUsd, shares);

    logger.info(`✓ Real trade executed: ${truncateAddress(rating.walletAddress)} | ${trade.outcome} @ ${trade.price} | ${formatUSD(amountUsd)} | Order: ${result.orderId}`);

    // Broadcast new trade to WebSocket clients
    this.broadcastTradeUpdate(result.tradeId!, rating, trade, amountUsd, shares);

    return {
      mode: 'real',
      executed: true,
      tradeId: result.tradeId,
      orderId: result.orderId,
      amount: amountUsd,
      shares,
    };
  }

  /**
   * Log trade execution details
   */
  private logTradeExecution(rating: BetRating, trade: Trade, amount: number, shares: number): void {
    const walletStats = getWalletStats(rating.walletAddress);
    const walletType = this.getWalletType(rating.walletAddress);
    
    const confidenceBreakdownNumeric: Record<string, number> = {};
    for (const [key, value] of Object.entries(rating.breakdown)) {
      confidenceBreakdownNumeric[key] = parseFloat(value.split('=')[1] || '0');
    }

    logTrade({
      triggeredBy: rating.walletAddress,
      walletType,
      walletAge: walletStats ? timeAgo(walletStats.first_seen) : 'Unknown',
      walletScore: rating.walletScore,
      winRate: walletStats ? `${walletStats.winRate * 100}% (${walletStats.win_count}/${walletStats.total_trades})` : 'N/A',
      market: trade.title,
      conditionId: trade.conditionId,
      outcome: trade.outcome,
      entryPrice: trade.price,
      confidence: rating.finalScore,
      confidenceBreakdown: confidenceBreakdownNumeric,
      virtualAmount: amount,
      shares,
      potentialPayout: shares,
      risk: amount,
    });
  }

  /**
   * Broadcast trade update to WebSocket clients
   */
  private broadcastTradeUpdate(
    tradeId: string,
    rating: BetRating,
    trade: Trade,
    amount: number,
    shares: number
  ): void {
    try {
      const wsManager = getWebSocketManager();
      if (wsManager) {
        wsManager.sendNewTrade({
          id: tradeId,
          wallet: rating.walletAddress,
          market: trade.title,
          outcome: trade.outcome,
          price: trade.price,
          amount,
          shares,
          confidence: rating.finalScore,
          timestamp: Date.now(),
        });
        
        // Also send updated portfolio (paper mode only)
        if (CONFIG.TRADING_MODE === 'paper') {
          wsManager.sendPortfolioUpdate(this.getPortfolioStatus());
        }
      }
    } catch (error) {
      // Silently fail if dashboard is not running
      logger.debug('WebSocket broadcast skipped (dashboard not running)');
    }
  }

  /**
   * Get current portfolio status
   */
  getPortfolioStatus() {
    const stats = getPaperTradeStats();
    const openTrades = getOpenPaperTrades();
    
    const lockedCapital = openTrades.reduce((sum, t) => sum + t.virtual_amount, 0);
    const availableBalance = this.paperBalance;
    const totalValue = availableBalance + lockedCapital;

    return {
      startingBalance: CONFIG.INITIAL_PAPER_BALANCE,
      currentBalance: this.paperBalance,
      lockedCapital,
      totalValue,
      pnl: stats.total_pnl,
      pnlPercent: (stats.total_pnl / CONFIG.INITIAL_PAPER_BALANCE) * 100,
      openPositions: stats.open,
      completedTrades: stats.completed,
      winRate: stats.winRate,
      winningTrades: stats.winning,
      losingTrades: stats.losing,
    };
  }

  /**
   * Get wallet type description
   */
  private getWalletType(address: string): string {
    const wallet = getWalletStats(address);
    if (!wallet) return 'UNKNOWN';

    const types: string[] = [];
    if (wallet.is_whale) types.push('WHALE');
    if (wallet.is_new_suspicious) types.push('NEW');
    
    return types.length > 0 ? types.join('+') : 'TRACKED';
  }

  /**
   * Ensure engine is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      this.initialize();
    }
  }

  /**
   * Update balance (used when resolving trades)
   */
  updateBalance(amount: number): void {
    this.paperBalance += amount;
    logger.info(`Balance updated: ${amount >= 0 ? '+' : ''}${formatUSD(amount)} | New balance: ${formatUSD(this.paperBalance)}`);
    
    // Broadcast portfolio update to WebSocket clients
    try {
      const wsManager = getWebSocketManager();
      if (wsManager) {
        wsManager.sendPortfolioUpdate(this.getPortfolioStatus());
      }
    } catch (error) {
      // Silently fail if dashboard is not running
      logger.debug('WebSocket broadcast skipped (dashboard not running)');
    }
  }

  /**
   * Reset paper trading (for testing)
   */
  reset(): void {
    this.paperBalance = CONFIG.INITIAL_PAPER_BALANCE;
    logger.info('Paper trading engine reset');
  }
}

export const tradeEngine = new TradeEngine();
