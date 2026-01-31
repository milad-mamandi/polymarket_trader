import { BetRating } from './betRater.js';
import { Trade } from './polymarket/types.js';
import { insertPaperTrade, getOpenPaperTrades, getPaperTradeStats, checkExistingMarketTrade } from '../models/paperTrade.js';
import { CONFIG } from '../config/settings.js';
import { logger, logTrade } from '../utils/logger.js';
import { generateId, formatUSD, timeAgo, truncateAddress } from '../utils/helpers.js';
import { getWalletStats } from '../models/wallet.js';
import { getWebSocketManager } from '../index.js';
import { executeRealTrade } from './realTradeExecutor.js';
import { polymarketApi } from './polymarket/api.js';

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
    // Check position and capital limits BEFORE calculating position size
    const limitsCheck = this.checkPositionLimits();
    if (!limitsCheck.allowed) {
      return {
        mode: 'paper',
        executed: false,
        reason: limitsCheck.reason!,
      };
    }

    // CRITICAL: Check for duplicate trades across ALL wallets (not just this one)
    const trade = rating.trade;
    const duplicateCheck = checkExistingMarketTrade(trade.conditionId, trade.outcome);
    if (duplicateCheck.exists) {
      logger.warn(`Trade blocked - ${duplicateCheck.reason}`);
      return {
        mode: 'paper',
        executed: false,
        reason: `Duplicate trade blocked: ${duplicateCheck.reason}`,
      };
    }

    // CRITICAL: Validate market status before executing
    const marketValidation = await this.validateMarketForTrading(trade.conditionId);
    if (!marketValidation.isValid) {
      logger.warn(`Trade blocked - ${marketValidation.reason}: ${trade.title}`);
      return {
        mode: 'paper',
        executed: false,
        reason: `Market validation failed: ${marketValidation.reason}`,
      };
    }

    // Calculate position size using Kelly Criterion
    const positionSize = this.calculateKellyPosition(rating);
    
    // Check minimum trade amount
    if (positionSize < CONFIG.MIN_TRADE_AMOUNT_USD) {
      return {
        mode: 'paper',
        executed: false,
        reason: `Position size ${formatUSD(positionSize)} below minimum ${formatUSD(CONFIG.MIN_TRADE_AMOUNT_USD)}`,
      };
    }

    // Check if we have enough balance
    if (positionSize > this.paperBalance) {
      return {
        mode: 'paper',
        executed: false,
        reason: `Insufficient balance: ${formatUSD(this.paperBalance)} < ${formatUSD(positionSize)}`,
      };
    }

    // Final check: Will this trade exceed locked capital limit?
    const openTrades = getOpenPaperTrades();
    const currentLocked = openTrades.reduce((sum, t) => sum + t.virtual_amount, 0);
    const maxAllowedLocked = CONFIG.INITIAL_PAPER_BALANCE * (CONFIG.MAX_LOCKED_CAPITAL_PERCENT / 100);
    
    if (currentLocked + positionSize > maxAllowedLocked) {
      return {
        mode: 'paper',
        executed: false,
        reason: `Trade would exceed locked capital limit: ${formatUSD(currentLocked + positionSize)} > ${formatUSD(maxAllowedLocked)} (${CONFIG.MAX_LOCKED_CAPITAL_PERCENT}% of initial balance)`,
      };
    }

    // Execute the paper trade
    const shares = positionSize / trade.price;
    const tradeId = generateId();

    // Fetch market data to get end date (use debug level to avoid logging 422s)
    let marketEndDate: string | null = null;
    try {
      const market = await polymarketApi.getMarketByConditionId(trade.conditionId, 'debug');
      marketEndDate = market?.endDate || null;
    } catch (error) {
      // Silently fail - end date is optional
      logger.debug(`Could not fetch market end date for ${trade.conditionId}`);
    }

    insertPaperTrade({
      id: tradeId,
      triggered_by: rating.walletAddress,
      market_id: trade.conditionId,
      market_title: trade.title,
      market_slug: trade.eventSlug,
      market_end_date: marketEndDate || undefined,
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
    
    // Calculate position size using Kelly Criterion
    const positionSize = this.calculateKellyPosition(rating);

    // Ensure position size doesn't exceed max real trading limit
    const amountUsd = Math.min(positionSize, CONFIG.REAL_TRADING_MAX_POSITION_USD);
    
    // Check minimum trade amount
    if (amountUsd < CONFIG.MIN_TRADE_AMOUNT_USD) {
      return {
        mode: 'real',
        executed: false,
        reason: `Position size ${formatUSD(amountUsd)} below minimum ${formatUSD(CONFIG.MIN_TRADE_AMOUNT_USD)}`,
      };
    }

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
   * Calculate position size using Kelly Criterion
   * 
   * Kelly formula: f* = (bp - q) / b
   * Where:
   * - f* = fraction of bankroll to bet
   * - b = odds received (payout ratio = 1/price - 1)
   * - p = probability of winning
   * - q = probability of losing (1 - p)
   * 
   * We derive win probability from confidence score and market price
   */
  private calculateKellyPosition(rating: BetRating): number {
    const trade = rating.trade;
    const price = trade.price;
    
    // Market implied probability
    const impliedProb = price;
    
    // Our estimated edge based on confidence score
    // High confidence (e.g., 90%) suggests we have an edge over market
    const confidenceProb = rating.finalScore / 100;
    
    // Calculate our adjusted probability (blend confidence with market)
    // If confidence is 90% and market is 60%, we think true prob is around 75%
    const edgeAdjustment = (confidenceProb - impliedProb) * 0.5;
    const winProb = Math.min(0.95, Math.max(0.05, impliedProb + edgeAdjustment));
    
    // Calculate payout odds: if price is 0.6, you win 1/0.6 - 1 = 0.667 (66.7% profit)
    const payoutOdds = (1 / price) - 1;
    
    // Kelly Criterion: (odds * p - q) / odds
    const lossProb = 1 - winProb;
    const kellyFraction = (payoutOdds * winProb - lossProb) / payoutOdds;
    
    // Apply fractional Kelly (e.g., 0.5 = half-Kelly for reduced variance)
    const fractionalKelly = Math.max(0, kellyFraction * CONFIG.KELLY_FRACTION);
    
    // Calculate position size
    let positionSize = this.paperBalance * fractionalKelly;
    
    // Apply maximum bet percentage cap
    const maxBet = this.paperBalance * (CONFIG.MAX_KELLY_BET_PERCENT / 100);
    positionSize = Math.min(positionSize, maxBet);
    
    // Log Kelly calculation for debugging
    logger.debug(`Kelly calculation: price=${price.toFixed(3)}, confidence=${rating.finalScore}%, winProb=${(winProb*100).toFixed(1)}%, kelly=${(kellyFraction*100).toFixed(1)}%, fractional=${(fractionalKelly*100).toFixed(1)}%, size=${formatUSD(positionSize)}`);
    
    return positionSize;
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
   * Check if we can open a new position based on limits
   */
  private checkPositionLimits(): { allowed: boolean; reason?: string } {
    const openTrades = getOpenPaperTrades();
    const openPositionCount = openTrades.length;
    
    // Check max open positions
    if (openPositionCount >= CONFIG.MAX_OPEN_POSITIONS) {
      logger.warn(`⚠️ Cannot open new position: Already at max open positions (${openPositionCount}/${CONFIG.MAX_OPEN_POSITIONS})`);
      
      // Emit warning to dashboard
      try {
        const wsManager = getWebSocketManager();
        if (wsManager) {
          wsManager.broadcast({
            type: 'bot:warning',
            data: {
              message: `Max open positions reached (${openPositionCount}/${CONFIG.MAX_OPEN_POSITIONS})`,
              timestamp: new Date().toISOString(),
            },
          });
        }
      } catch (error) {
        // Silently fail
      }
      
      return {
        allowed: false,
        reason: `Max open positions reached: ${openPositionCount}/${CONFIG.MAX_OPEN_POSITIONS}`,
      };
    }
    
    return { allowed: true };
  }

  /**
   * Validate if a market is tradable (not ended, closed, or resolved)
   * Additional safety check beyond what betRater already validates
   */
  private async validateMarketForTrading(conditionId: string): Promise<{ isValid: boolean; reason?: string }> {
    try {
      const market = await polymarketApi.getMarketByConditionId(conditionId, 'debug');
      
      if (!market) {
        return { isValid: false, reason: 'Market not found or archived' };
      }

      // Check if market is resolved
      if (market.resolved) {
        return { isValid: false, reason: 'Market already resolved' };
      }

      // Check if market is closed
      if (market.closed) {
        return { isValid: false, reason: 'Market is closed' };
      }

      // Check if market is not active
      if (!market.active) {
        return { isValid: false, reason: 'Market is not active' };
      }

      // Check if market has ended (end date passed)
      if (market.endDate) {
        const endDate = new Date(market.endDate);
        const now = new Date();
        
        if (endDate < now) {
          return { isValid: false, reason: `Market ended on ${market.endDate}` };
        }

        // Check if market ends within 24 hours (configurable)
        const hoursUntilEnd = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (hoursUntilEnd < 24) {
          return { isValid: false, reason: `Market ends in ${Math.round(hoursUntilEnd)} hours (min 24h required)` };
        }
      }

      return { isValid: true };
    } catch (error) {
      // If we can't fetch market data, assume it's invalid to be safe
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to validate market ${conditionId}: ${errorMessage}`);
      return { isValid: false, reason: 'Unable to verify market status' };
    }
  }

  /**
   * Get balance health status (for dashboard warnings)
   */
  getBalanceHealth(): { status: 'healthy' | 'warning' | 'critical'; availablePercent: number; openPositionCount: number; message?: string } {
    const openTrades = getOpenPaperTrades();
    const lockedCapital = openTrades.reduce((sum, t) => sum + t.virtual_amount, 0);
    const availablePercent = (this.paperBalance / CONFIG.INITIAL_PAPER_BALANCE) * 100;
    const openPositionCount = openTrades.length;
    const positionUtilization = (openPositionCount / CONFIG.MAX_OPEN_POSITIONS) * 100;
    
    // Critical: Low balance or high position count
    if (availablePercent < CONFIG.LOW_BALANCE_WARNING_PERCENT) {
      return {
        status: 'critical',
        availablePercent,
        openPositionCount,
        message: `Low available balance: ${formatUSD(this.paperBalance)} (${availablePercent.toFixed(1)}% of initial)`,
      };
    }
    
    if (openPositionCount >= CONFIG.MAX_OPEN_POSITIONS * 0.9) {
      return {
        status: 'critical',
        availablePercent,
        openPositionCount,
        message: `High position count: ${openPositionCount}/${CONFIG.MAX_OPEN_POSITIONS} (${positionUtilization.toFixed(0)}%)`,
      };
    }
    
    // Warning: Moderate concerns
    if (availablePercent < CONFIG.LOW_BALANCE_WARNING_PERCENT * 2) {
      return {
        status: 'warning',
        availablePercent,
        openPositionCount,
        message: `Available balance below ${(CONFIG.LOW_BALANCE_WARNING_PERCENT * 2).toFixed(0)}%`,
      };
    }
    
    if (openPositionCount >= CONFIG.MAX_OPEN_POSITIONS * 0.7) {
      return {
        status: 'warning',
        availablePercent,
        openPositionCount,
        message: `Position count at ${positionUtilization.toFixed(0)}% capacity`,
      };
    }
    
    // Healthy
    return {
      status: 'healthy',
      availablePercent,
      openPositionCount,
    };
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
