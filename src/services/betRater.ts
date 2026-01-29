import { Trade, Position } from './polymarket/types.js';
import { polymarketApi } from './polymarket/api.js';
import { getWalletStats } from '../models/wallet.js';
import { CONFIG } from '../config/settings.js';
import { logger } from '../utils/logger.js';

export interface BetRating {
  trade: Trade;
  walletAddress: string;
  walletScore: number;
  marketConfidence: number;
  sizeSignal: number;
  timingScore: number;
  consensusScore: number;
  finalScore: number;
  breakdown: Record<string, string>;
  shouldTrade: boolean;
}

/**
 * Bet Rater Service
 * Rates individual bets based on multiple factors
 */
export class BetRater {
  private marketCache: Map<string, any> = new Map();

  /**
   * Rate a bet from a watched wallet
   */
  async rateBet(trade: Trade, walletSuspicionScore: number): Promise<BetRating> {
    logger.info(`Rating bet from ${trade.proxyWallet} on "${trade.title}"`);

    // Get wallet statistics
    const walletStats = getWalletStats(trade.proxyWallet);
    
    // Calculate individual rating components
    const walletScore = this.calculateWalletScore(walletStats, walletSuspicionScore);
    const marketConfidence = await this.calculateMarketConfidence(trade.conditionId);
    const sizeSignal = this.calculateSizeSignal(trade);
    const timingScore = this.calculateTimingScore(trade);
    const consensusScore = await this.calculateConsensusScore(trade);

    // Weighted final score
    const finalScore = Math.round(
      walletScore * 0.30 +
      sizeSignal * 0.25 +
      marketConfidence * 0.20 +
      timingScore * 0.15 +
      consensusScore * 0.10
    );

    const shouldTrade = finalScore >= CONFIG.MIN_CONFIDENCE_FOR_TRADE;

    const rating: BetRating = {
      trade,
      walletAddress: trade.proxyWallet,
      walletScore: Math.round(walletScore),
      marketConfidence: Math.round(marketConfidence),
      sizeSignal: Math.round(sizeSignal),
      timingScore: Math.round(timingScore),
      consensusScore: Math.round(consensusScore),
      finalScore,
      breakdown: {
        'Wallet Score': `${Math.round(walletScore)} (x0.30) = ${(walletScore * 0.30).toFixed(1)}`,
        'Size Signal': `${Math.round(sizeSignal)} (x0.25) = ${(sizeSignal * 0.25).toFixed(1)}`,
        'Market Quality': `${Math.round(marketConfidence)} (x0.20) = ${(marketConfidence * 0.20).toFixed(1)}`,
        'Timing': `${Math.round(timingScore)} (x0.15) = ${(timingScore * 0.15).toFixed(1)}`,
        'Consensus': `${Math.round(consensusScore)} (x0.10) = ${(consensusScore * 0.10).toFixed(1)}`,
      },
      shouldTrade,
    };

    logger.info(`Bet rated: ${finalScore}/100 | Should trade: ${shouldTrade}`);

    return rating;
  }

  /**
   * Calculate wallet reliability score (0-100)
   */
  private calculateWalletScore(walletStats: any, suspicionScore: number): number {
    if (!walletStats) return suspicionScore;

    const { winRate, totalTrades } = walletStats;

    // Combine suspicion score with historical performance
    let score = suspicionScore * 0.5;

    // Add performance component
    if (totalTrades >= 5) {
      const performanceScore = winRate * 100;
      score += performanceScore * 0.5;
    } else {
      // Not enough history, rely more on suspicion score
      score = suspicionScore;
    }

    return Math.min(score, 100);
  }

  /**
   * Calculate market quality/confidence (0-100)
   */
  private async calculateMarketConfidence(conditionId: string): Promise<number> {
    // Check cache first
    if (this.marketCache.has(conditionId)) {
      const cached = this.marketCache.get(conditionId);
      if (Date.now() - cached.timestamp < 60000) { // 1 minute cache
        return cached.score;
      }
    }

    // Fetch market data
    const market = await polymarketApi.getMarketByConditionId(conditionId);
    
    if (!market) return 50; // Unknown market

    let score = 50;

    // High volume = more reliable
    if (market.volume > 1000000) score += 20;
    else if (market.volume > 500000) score += 15;
    else if (market.volume > 100000) score += 10;
    else if (market.volume > 50000) score += 5;

    // High liquidity = better
    if (market.liquidity > 100000) score += 15;
    else if (market.liquidity > 50000) score += 10;
    else if (market.liquidity > 10000) score += 5;

    // Active market
    if (market.active) score += 15;

    // Cache the result
    this.marketCache.set(conditionId, {
      score: Math.min(score, 100),
      timestamp: Date.now(),
    });

    return Math.min(score, 100);
  }

  /**
   * Calculate size signal (0-100)
   * Larger bets indicate higher confidence
   */
  private calculateSizeSignal(trade: Trade): number {
    const tradeValue = trade.size * trade.price;

    // Absolute size thresholds
    if (tradeValue > 200000) return 95;
    if (tradeValue > 100000) return 85;
    if (tradeValue > 75000) return 75;
    if (tradeValue > 50000) return 65;
    if (tradeValue > 25000) return 55;
    return 45;
  }

  /**
   * Calculate timing score (0-100)
   * Considers when the bet was placed relative to market lifecycle
   */
  private calculateTimingScore(trade: Trade): number {
    // Would need market end date for proper calculation
    // For now, use trade price as proxy for timing
    
    // Betting at extreme prices might indicate late timing or high conviction
    if (trade.price > 0.8 || trade.price < 0.2) {
      return 70; // High conviction on extreme odds
    }
    
    // Moderate prices
    return 60;
  }

  /**
   * Calculate consensus score (0-100)
   * Check if other whales agree with this bet
   */
  private async calculateConsensusScore(trade: Trade): Promise<number> {
    // Get top holders for this market
    // For now, return neutral score
    // TODO: Implement when we track multiple whale positions
    return 60;
  }

  /**
   * Clear market cache
   */
  clearCache(): void {
    this.marketCache.clear();
  }
}

export const betRater = new BetRater();
