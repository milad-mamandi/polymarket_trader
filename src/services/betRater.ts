import { Trade, Position } from './polymarket/types.js';
import { polymarketApi } from './polymarket/api.js';
import { getWalletStats, getWallet } from '../models/wallet.js';
import { getWalletTradesForMarket } from '../models/trade.js';
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
   * Known whales from leaderboard get bonus points
   */
  private calculateWalletScore(walletStats: any, suspicionScore: number): number {
    if (!walletStats) return suspicionScore;

    const { winRate, total_trades, address } = walletStats;
    
    // Check if this is a known whale from leaderboard
    const wallet = getWallet(address);
    const isLeaderboardWhale = wallet?.is_whale && wallet?.total_volume > 100000;

    // Start with higher base score for known whales
    let score = isLeaderboardWhale ? 70 : suspicionScore * 0.5;

    // Add performance component
    if (total_trades >= 5) {
      const performanceScore = winRate * 100;
      score = isLeaderboardWhale ? 
        score * 0.6 + performanceScore * 0.4 :  // Known whale: performance matters less
        suspicionScore * 0.5 + performanceScore * 0.5;  // New wallet: balance both
    } else if (isLeaderboardWhale) {
      // Known whale with little tracked history - still trust them
      score = 70;
    } else {
      // Not enough history, rely on suspicion score
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

    // Fetch market data with debug level (expected to fail for old/archived markets)
    const market = await polymarketApi.getMarketByConditionId(conditionId, 'debug');
    
    if (!market) return 50; // Unknown market, neutral score

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
   * Adjusted thresholds for better scaling
   */
  private calculateSizeSignal(trade: Trade): number {
    const tradeValue = trade.size * trade.price;

    // Adjusted thresholds - more generous for whale-level trades
    if (tradeValue > 500000) return 95;
    if (tradeValue > 200000) return 90;
    if (tradeValue > 100000) return 85;
    if (tradeValue > 75000) return 80;
    if (tradeValue > 50000) return 75; // Whale threshold = good score
    if (tradeValue > 25000) return 65;
    return 55;
  }

  /**
   * Calculate timing score (0-100)
   * Considers when the bet was placed relative to market lifecycle
   * Early/bold bets on extreme odds = higher conviction
   */
  private calculateTimingScore(trade: Trade): number {
    let score = 60; // Base score
    
    // Betting at extreme prices indicates high conviction
    if (trade.price > 0.9) {
      score = 85; // Very high conviction on likely outcome
    } else if (trade.price < 0.1) {
      score = 90; // Very high conviction on unlikely outcome
    } else if (trade.price > 0.75 || trade.price < 0.25) {
      score = 75; // High conviction
    } else if (trade.price > 0.6 || trade.price < 0.4) {
      score = 65; // Moderate conviction
    }
    
    return score;
  }

  /**
   * Calculate consensus score (0-100)
   * Check if other whales agree with this bet
   */
  private async calculateConsensusScore(trade: Trade): Promise<number> {
    try {
      // Get all whale trades for this market
      const trades = getWalletTradesForMarket(trade.conditionId);
      
      if (trades.length <= 1) {
        return 60; // No consensus data, neutral score
      }

      // Count how many whales bet on the same outcome
      const sameOutcome = trades.filter(t => 
        t.outcome === trade.outcome && t.wallet_address !== trade.proxyWallet
      ).length;

      const totalOtherWhales = trades.filter(t => 
        t.wallet_address !== trade.proxyWallet
      ).length;

      if (totalOtherWhales === 0) {
        return 60; // No other whales, neutral
      }

      // Calculate consensus ratio
      const consensusRatio = sameOutcome / totalOtherWhales;

      // Convert to score
      if (consensusRatio > 0.75) return 90; // Strong consensus
      if (consensusRatio > 0.5) return 75;  // Majority agrees
      if (consensusRatio > 0.25) return 60; // Some agreement
      return 50; // Most disagree
      
    } catch (error) {
      logger.error('Error calculating consensus score:', error);
      return 60; // Default neutral score on error
    }
  }

  /**
   * Clear market cache
   */
  clearCache(): void {
    this.marketCache.clear();
  }
}

export const betRater = new BetRater();
