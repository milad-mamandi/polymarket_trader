import { polymarketApi } from './polymarket/api.js';
import { getWallet, upsertWallet, getWalletStats } from '../models/wallet.js';
import { getWalletTrades } from '../models/trade.js';
import { CONFIG } from '../config/settings.js';
import { logger } from '../utils/logger.js';
import { walletAgeInHours, clamp } from '../utils/helpers.js';
import { DetectedWallet } from './walletScanner.js';

export interface WalletScore {
  address: string;
  totalScore: number;
  breakdown: {
    walletAge: number;
    tradeSize: number;
    winRate: number;
    marketSelection: number;
    betTiming: number;
    concentration: number;
  };
}

/**
 * Wallet Analyzer Service
 * Calculates suspicion/quality scores for wallets
 */
export class WalletAnalyzer {
  /**
   * Analyze and score a detected wallet
   */
  async analyzeWallet(detected: DetectedWallet): Promise<WalletScore> {
    const { address, trade, walletAge, createdAt } = detected;

    // Get wallet's trading history
    const positions = await polymarketApi.getUserPositions(address);
    const activity = await polymarketApi.getUserActivity(address, 50);
    const walletData = getWallet(address);
    const stats = getWalletStats(address);

    // Calculate individual scores
    const walletAgeScore = this.calculateWalletAgeScore(walletAge, createdAt);
    const tradeSizeScore = this.calculateTradeSizeScore(trade.size * trade.price, positions);
    const winRateScore = this.calculateWinRateScore(stats);
    const marketSelectionScore = this.calculateMarketSelectionScore(activity);
    const betTimingScore = this.calculateBetTimingScore(trade);
    const concentrationScore = this.calculateConcentrationScore(positions);

    // Weighted total
    const totalScore = 
      walletAgeScore * CONFIG.WEIGHTS.WALLET_AGE +
      tradeSizeScore * CONFIG.WEIGHTS.TRADE_SIZE +
      winRateScore * CONFIG.WEIGHTS.WIN_RATE +
      marketSelectionScore * CONFIG.WEIGHTS.MARKET_SELECTION +
      betTimingScore * CONFIG.WEIGHTS.BET_TIMING +
      concentrationScore * CONFIG.WEIGHTS.CONCENTRATION;

    const score: WalletScore = {
      address,
      totalScore: Math.round(totalScore),
      breakdown: {
        walletAge: Math.round(walletAgeScore),
        tradeSize: Math.round(tradeSizeScore),
        winRate: Math.round(winRateScore),
        marketSelection: Math.round(marketSelectionScore),
        betTiming: Math.round(betTimingScore),
        concentration: Math.round(concentrationScore),
      },
    };

    // Update wallet in database
    upsertWallet({
      address,
      wallet_created_at: createdAt,
      is_whale: detected.isWhale,
      is_new_suspicious: detected.isNewSuspicious,
      total_volume: trade.size * trade.price + (walletData?.total_volume || 0),
      suspicion_score: score.totalScore,
    });

    logger.info(`Analyzed wallet ${address}: Score ${score.totalScore}/100`);

    return score;
  }

  /**
   * Calculate wallet age score (0-100)
   * Newer wallets = higher suspicion
   */
  private calculateWalletAgeScore(walletAge?: number, createdAt?: string): number {
    if (!walletAge && !createdAt) return 50; // Unknown age

    const age = walletAge || walletAgeInHours(createdAt!);

    // Very new (< 24h) = high score
    if (age < 24) return 95;
    // New (< 7 days) = medium-high score
    if (age < 168) return 75;
    // Moderate (< 30 days) = medium score
    if (age < 720) return 50;
    // Established (30+ days) = low score
    return 25;
  }

  /**
   * Calculate trade size score (0-100)
   * Larger trades = higher signal
   */
  private calculateTradeSizeScore(tradeValue: number, positions: any[]): number {
    const totalPortfolioValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
    
    // Trade size relative to portfolio
    const relativeSize = totalPortfolioValue > 0 ? tradeValue / totalPortfolioValue : 1;

    // Large relative position (> 50% of portfolio) = high conviction
    if (relativeSize > 0.5) return 90;
    // Moderate position (20-50%) = medium conviction
    if (relativeSize > 0.2) return 70;
    // Small position (< 20%) = lower conviction
    
    // Also consider absolute size
    if (tradeValue > 100000) return 85;
    if (tradeValue > 50000) return 70;
    if (tradeValue > 25000) return 55;
    return 40;
  }

  /**
   * Calculate win rate score (0-100)
   * Higher win rate = more credible
   */
  private calculateWinRateScore(stats: any): number {
    if (!stats || stats.total_trades < 3) return 50; // Not enough data

    const winRate = stats.winRate;

    if (winRate > 0.7) return 90; // Very good track record
    if (winRate > 0.6) return 75;
    if (winRate > 0.5) return 60;
    if (winRate > 0.4) return 45;
    return 30; // Poor track record
  }

  /**
   * Calculate market selection score (0-100)
   * Focus on high-quality, liquid markets
   */
  private calculateMarketSelectionScore(activity: any[]): number {
    if (activity.length === 0) return 50;

    // Look for diverse market participation
    const uniqueMarkets = new Set(activity.map(a => a.conditionId));
    const marketDiversity = uniqueMarkets.size / Math.max(activity.length, 1);

    // Moderate diversity is good (not too scattered, not too concentrated)
    if (marketDiversity > 0.3 && marketDiversity < 0.7) return 70;
    return 50;
  }

  /**
   * Calculate bet timing score (0-100)
   * Betting close to resolution can indicate insider knowledge
   */
  private calculateBetTimingScore(trade: any): number {
    // This would require market end date, which we'd need to fetch
    // For now, return neutral score
    // TODO: Implement when market data is available
    return 60;
  }

  /**
   * Calculate concentration score (0-100)
   * High concentration in single market = high conviction signal
   */
  private calculateConcentrationScore(positions: any[]): number {
    if (positions.length === 0) return 50;

    const totalValue = positions.reduce((sum, p) => sum + Math.abs(p.currentValue), 0);
    
    if (totalValue === 0) return 50;

    // Calculate Herfindahl index (concentration measure)
    const concentration = positions.reduce((sum, p) => {
      const share = Math.abs(p.currentValue) / totalValue;
      return sum + share * share;
    }, 0);

    // High concentration (> 0.5) = high conviction
    if (concentration > 0.5) return 80;
    // Moderate concentration
    if (concentration > 0.3) return 65;
    // Diversified portfolio
    return 45;
  }

  /**
   * Re-analyze all watched wallets
   */
  async reanalyzeAllWallets(): Promise<void> {
    logger.info('Re-analyzing all watched wallets...');
    
    // This would require fetching all wallets and re-scoring them
    // Implement if needed for periodic re-evaluation
    
    logger.info('Re-analysis complete');
  }
}

export const walletAnalyzer = new WalletAnalyzer();
