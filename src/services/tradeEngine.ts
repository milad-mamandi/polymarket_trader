import { BetRating } from './betRater.js';
import { Trade } from './polymarket/types.js';
import { insertPaperTrade, getOpenPaperTrades, getPaperTradeStats } from '../models/paperTrade.js';
import { CONFIG } from '../config/settings.js';
import { logger, logTrade } from '../utils/logger.js';
import { generateId, formatUSD, timeAgo, truncateAddress } from '../utils/helpers.js';
import { getWalletStats } from '../models/wallet.js';
import { getWebSocketManager } from '../index.js';

export interface PaperTradeResult {
  executed: boolean;
  tradeId?: string;
  reason?: string;
  amount?: number;
  shares?: number;
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
   * Evaluate and potentially execute a paper trade
   */
  async evaluateTrade(rating: BetRating): Promise<PaperTradeResult> {
    this.ensureInitialized();

    // Check if rating meets threshold
    if (!rating.shouldTrade) {
      return {
        executed: false,
        reason: `Confidence too low: ${rating.finalScore}% < ${CONFIG.MIN_CONFIDENCE_FOR_TRADE}%`,
      };
    }

    // Calculate position size (percentage of portfolio)
    const maxAmount = this.paperBalance * (CONFIG.MAX_POSITION_SIZE_PERCENT / 100);
    
    // Scale position size based on confidence
    // Higher confidence = larger position (up to max)
    const confidenceMultiplier = rating.finalScore / 100;
    const positionSize = maxAmount * confidenceMultiplier;

    // Check if we have enough balance
    if (positionSize > this.paperBalance) {
      return {
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
      winRate: walletStats ? `${walletStats.winRate * 100}% (${walletStats.win_count}/${walletStats.totalTrades})` : 'N/A',
      market: trade.title,
      conditionId: trade.conditionId,
      outcome: trade.outcome,
      entryPrice: trade.price,
      confidence: rating.finalScore,
      confidenceBreakdown: confidenceBreakdownNumeric,
      virtualAmount: positionSize,
      shares,
      potentialPayout: shares,
      risk: positionSize,
    });

    logger.info(`✓ Paper trade executed: ${truncateAddress(rating.walletAddress)} | ${trade.outcome} @ ${trade.price} | ${formatUSD(positionSize)}`);

    // Broadcast new trade to WebSocket clients
    try {
      const wsManager = getWebSocketManager();
      if (wsManager) {
        wsManager.sendNewTrade({
          id: tradeId,
          wallet: rating.walletAddress,
          market: trade.title,
          outcome: trade.outcome,
          price: trade.price,
          amount: positionSize,
          shares,
          confidence: rating.finalScore,
          timestamp: Date.now(),
        });
        
        // Also send updated portfolio
        wsManager.sendPortfolioUpdate(this.getPortfolioStatus());
      }
    } catch (error) {
      // Silently fail if dashboard is not running
      logger.debug('WebSocket broadcast skipped (dashboard not running)');
    }

    return {
      executed: true,
      tradeId,
      amount: positionSize,
      shares,
    };
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
