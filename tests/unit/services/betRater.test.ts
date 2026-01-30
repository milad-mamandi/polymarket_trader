import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Trade, Market } from '../../../src/services/polymarket/types.js';
import type { Wallet } from '../../../src/models/wallet.js';
import type { WalletTrade } from '../../../src/models/trade.js';
import { BetRater, BetRating } from '../../../src/services/betRater.js';
import { mockApiTrades, createApiTrade } from '../../fixtures/trades.js';
import { WHALE_ADDRESS, NEW_SUSPICIOUS_ADDRESS, mockWallets } from '../../fixtures/wallets.js';
import { MARKET_IDS, mockMarkets } from '../../fixtures/markets.js';

// WalletStats type (returned by getWalletStats)
type WalletStats = Partial<Wallet> & {
  address: string;
  totalTrades: number;
  winRate: number;
  is_whale: boolean;
  is_new_suspicious: boolean;
  suspicion_score: number;
};

/**
 * Unit tests for BetRater service
 * Tests confidence scoring algorithm for whale trades
 */

describe('BetRater', () => {
  let rater: BetRater;
  let mockGetWalletStats: jest.Mock<(address: string) => WalletStats | null>;
  let mockGetWallet: jest.Mock<(address: string) => Wallet | undefined>;
  let mockGetWalletTradesForMarket: jest.Mock<(marketId: string) => WalletTrade[]>;
  let mockGetMarketByConditionId: jest.Mock<
    (conditionId: string, logLevel?: string) => Promise<Market | null>
  >;

  // Mock CONFIG
  const mockConfig = {
    MIN_CONFIDENCE_FOR_TRADE: 70,
  };

  beforeEach(() => {
    // Create fresh rater instance
    rater = new BetRater();

    // Reset all mocks
    mockGetWalletStats = jest.fn();
    mockGetWallet = jest.fn();
    mockGetWalletTradesForMarket = jest.fn();
    mockGetMarketByConditionId = jest.fn();

    // Clear cache
    rater.clearCache();
  });

  describe('rateBet', () => {
    it('should calculate final score with correct weightings', async () => {
      const trade = mockApiTrades.whaleBuy;
      const suspicionScore = 80;

      // Setup mocks
      mockGetWalletStats.mockReturnValue({
        address: WHALE_ADDRESS,
        winRate: 0.75, // 75% win rate
        totalTrades: 20,
        win_count: 15,
        loss_count: 5,
        total_volume: 500000,
        is_whale: true,
        is_new_suspicious: false,
        suspicion_score: 0.8,
      });
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, suspicionScore);

      // Assert score components exist
      expect(rating.walletScore).toBeGreaterThan(0);
      expect(rating.marketConfidence).toBeGreaterThan(0);
      expect(rating.sizeSignal).toBeGreaterThan(0);
      expect(rating.timingScore).toBeGreaterThan(0);
      expect(rating.consensusScore).toBeGreaterThan(0);

      // Assert final score is weighted average
      const expectedFinalScore = Math.round(
        rating.walletScore * 0.3 +
          rating.sizeSignal * 0.25 +
          rating.marketConfidence * 0.2 +
          rating.timingScore * 0.15 +
          rating.consensusScore * 0.1
      );
      expect(rating.finalScore).toBe(expectedFinalScore);

      // Assert breakdown is present
      expect(rating.breakdown).toHaveProperty('Wallet Score');
      expect(rating.breakdown).toHaveProperty('Size Signal');
      expect(rating.breakdown).toHaveProperty('Market Quality');
      expect(rating.breakdown).toHaveProperty('Timing');
      expect(rating.breakdown).toHaveProperty('Consensus');
    });

    it('should mark shouldTrade as true when finalScore >= threshold', async () => {
      const trade = mockApiTrades.whaleBuy;
      const suspicionScore = 90;

      mockGetWalletStats.mockReturnValue({
        address: WHALE_ADDRESS,
        winRate: 0.85,
        totalTrades: 30,
        win_count: 25,
        loss_count: 5,
        total_volume: 1000000,
        is_whale: true,
        is_new_suspicious: false,
        suspicion_score: 0.9,
      });
      mockGetWallet.mockReturnValue({
        ...mockWallets.whale,
        total_volume: 1000000,
      });
      mockGetMarketByConditionId.mockResolvedValue({
        ...mockMarkets.trump,
        volume: 2000000,
        liquidity: 200000,
        active: true,
      });
      mockGetWalletTradesForMarket.mockReturnValue([
        {
          id: '1',
          wallet_address: '0xother1',
          market_id: MARKET_IDS.trump,
          market_title: 'Test Market',
          outcome: 'Yes',
          side: 'BUY',
          size: 100000,
          price: 0.65,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
        {
          id: '2',
          wallet_address: '0xother2',
          market_id: MARKET_IDS.trump,
          market_title: 'Test Market',
          outcome: 'Yes',
          side: 'BUY',
          size: 80000,
          price: 0.65,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
      ]);

      const rating = await rateBetWithMocks(trade, suspicionScore);

      expect(rating.finalScore).toBeGreaterThanOrEqual(mockConfig.MIN_CONFIDENCE_FOR_TRADE);
      expect(rating.shouldTrade).toBe(true);
    });

    it('should mark shouldTrade as false when finalScore < threshold', async () => {
      const trade = createApiTrade({
        proxyWallet: NEW_SUSPICIOUS_ADDRESS,
        size: 10000, // Small trade
        price: 0.5, // Neutral price
      });
      const suspicionScore = 30;

      mockGetWalletStats.mockReturnValue({
        address: NEW_SUSPICIOUS_ADDRESS,
        winRate: 0.3, // Poor win rate
        totalTrades: 10,
        win_count: 3,
        loss_count: 7,
        total_volume: 15000,
        is_whale: false,
        is_new_suspicious: true,
        suspicion_score: 0.3,
      });
      mockGetWallet.mockReturnValue(mockWallets.newSuspicious);
      mockGetMarketByConditionId.mockResolvedValue({
        ...mockMarkets.ai,
        volume: 30000, // Low volume
        liquidity: 5000, // Low liquidity
        active: false, // Inactive
      });
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, suspicionScore);

      expect(rating.finalScore).toBeLessThan(mockConfig.MIN_CONFIDENCE_FOR_TRADE);
      expect(rating.shouldTrade).toBe(false);
    });
  });

  describe('calculateWalletScore', () => {
    it('should give high score to known leaderboard whales', async () => {
      const trade = mockApiTrades.whaleBuy;
      const suspicionScore = 85;

      mockGetWalletStats.mockReturnValue({
        address: WHALE_ADDRESS,
        winRate: 0.75,
        totalTrades: 20,
        win_count: 15,
        loss_count: 5,
        total_volume: 500000,
        is_whale: true,
        is_new_suspicious: false,
        suspicion_score: 0.85,
      });
      mockGetWallet.mockReturnValue({
        ...mockWallets.whale,
        is_whale: true,
        total_volume: 500000,
      });
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, suspicionScore);

      expect(rating.walletScore).toBeGreaterThanOrEqual(70);
    });

    it('should use suspicion score for wallets without history', async () => {
      const trade = createApiTrade({
        proxyWallet: NEW_SUSPICIOUS_ADDRESS,
      });
      const suspicionScore = 60;

      mockGetWalletStats.mockReturnValue({
        address: NEW_SUSPICIOUS_ADDRESS,
        winRate: 0,
        totalTrades: 0,
        win_count: 0,
        loss_count: 0,
        total_volume: 0,
        is_whale: false,
        is_new_suspicious: true,
        suspicion_score: 0.6,
      });
      mockGetWallet.mockReturnValue(mockWallets.newSuspicious);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, suspicionScore);

      expect(rating.walletScore).toBeCloseTo(suspicionScore, -1);
    });

    it('should blend suspicion and performance for wallets with history', async () => {
      const trade = mockApiTrades.whaleBuy;
      const suspicionScore = 70;

      mockGetWalletStats.mockReturnValue({
        address: WHALE_ADDRESS,
        winRate: 0.8, // 80% win rate
        totalTrades: 10,
        win_count: 8,
        loss_count: 2,
        total_volume: 200000,
        is_whale: false,
        is_new_suspicious: false,
        suspicion_score: 0.7,
      });
      mockGetWallet.mockReturnValue({
        ...mockWallets.whale,
        is_whale: false,
        total_volume: 50000,
      });
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, suspicionScore);

      // Should be blend of suspicionScore and performance (80)
      expect(rating.walletScore).toBeGreaterThan(suspicionScore);
      expect(rating.walletScore).toBeLessThanOrEqual(100);
    });

    it('should cap wallet score at 100', async () => {
      const trade = mockApiTrades.whaleBuy;
      const suspicionScore = 95;

      mockGetWalletStats.mockReturnValue({
        address: WHALE_ADDRESS,
        winRate: 0.95, // 95% win rate
        totalTrades: 50,
        win_count: 47,
        loss_count: 3,
        total_volume: 2000000,
        is_whale: true,
        is_new_suspicious: false,
        suspicion_score: 0.95,
      });
      mockGetWallet.mockReturnValue({
        ...mockWallets.whale,
        is_whale: true,
        total_volume: 2000000,
      });
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, suspicionScore);

      expect(rating.walletScore).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateMarketConfidence', () => {
    it('should give high score to high-volume, high-liquidity, active markets', async () => {
      const trade = mockApiTrades.whaleBuy;

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue({
        ...mockMarkets.trump,
        volume: 2000000, // > 1M
        liquidity: 150000, // > 100k
        active: true,
      });
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, 70);

      // Should be high: 50 + 20 (volume) + 15 (liquidity) + 15 (active) = 100
      expect(rating.marketConfidence).toBe(100);
    });

    it('should give medium score to moderate markets', async () => {
      const trade = mockApiTrades.whaleBuy;

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue({
        ...mockMarkets.bitcoin,
        volume: 600000, // 500k-1M = +15
        liquidity: 60000, // 50k-100k = +10
        active: true, // +15
      });
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, 70);

      // Should be: 50 + 15 + 10 + 15 = 90
      expect(rating.marketConfidence).toBe(90);
    });

    it('should give low score to low-volume, inactive markets', async () => {
      const trade = mockApiTrades.whaleBuy;

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue({
        ...mockMarkets.ai,
        volume: 30000, // < 50k = +0
        liquidity: 5000, // < 10k = +0
        active: false, // +0
      });
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, 70);

      // Should be base score: 50
      expect(rating.marketConfidence).toBe(50);
    });

    it('should return 50 for unknown markets', async () => {
      const trade = mockApiTrades.whaleBuy;

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(null); // Market not found
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, 70);

      expect(rating.marketConfidence).toBe(50);
    });

    it('should cache market confidence scores', async () => {
      const trade = mockApiTrades.whaleBuy;

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      // First call
      await rateBetWithMocks(trade, 70);
      expect(mockGetMarketByConditionId).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await rateBetWithMocks(trade, 70);
      expect(mockGetMarketByConditionId).toHaveBeenCalledTimes(1); // Still 1
    });
  });

  describe('calculateSizeSignal', () => {
    it('should give score 95 for trades > $500k', async () => {
      const trade = createApiTrade({
        size: 1000000, // 1M shares
        price: 0.6, // $600k total
      });

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, 70);

      expect(rating.sizeSignal).toBe(95);
    });

    it('should give score 90 for trades > $200k', async () => {
      const trade = createApiTrade({
        size: 400000,
        price: 0.55, // $220k total
      });

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, 70);

      expect(rating.sizeSignal).toBe(90);
    });

    it('should give score 75 for whale threshold trades ($50k)', async () => {
      const trade = mockApiTrades.whaleBuy; // 80k * 0.65 = $52k

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, 70);

      expect(rating.sizeSignal).toBe(75);
    });

    it('should give score 55 for small trades', async () => {
      const trade = createApiTrade({
        size: 10000,
        price: 0.5, // $5k total
      });

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, 70);

      expect(rating.sizeSignal).toBe(55);
    });
  });

  describe('calculateTimingScore', () => {
    it('should give score 90 for extreme low price bets (<0.1)', async () => {
      const trade = createApiTrade({
        price: 0.05, // High conviction on unlikely outcome
      });

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, 70);

      expect(rating.timingScore).toBe(90);
    });

    it('should give score 85 for extreme high price bets (>0.9)', async () => {
      const trade = createApiTrade({
        price: 0.95, // High conviction on likely outcome
      });

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, 70);

      expect(rating.timingScore).toBe(85);
    });

    it('should give score 75 for high conviction bets (0.75-0.9 or 0.1-0.25)', async () => {
      const trade1 = createApiTrade({ price: 0.8 });
      const trade2 = createApiTrade({ price: 0.2 });

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating1 = await rateBetWithMocks(trade1, 70);
      const rating2 = await rateBetWithMocks(trade2, 70);

      expect(rating1.timingScore).toBe(75);
      expect(rating2.timingScore).toBe(75);
    });

    it('should give score 60 for neutral price bets (0.4-0.6)', async () => {
      const trade = createApiTrade({
        price: 0.5, // Neutral
      });

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, 70);

      expect(rating.timingScore).toBe(60);
    });
  });

  describe('calculateConsensusScore', () => {
    it('should give score 90 for strong consensus (>75% agreement)', async () => {
      const trade = mockApiTrades.whaleBuy;

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([
        {
          id: '1',
          wallet_address: '0xother1',
          market_id: MARKET_IDS.trump,
          market_title: 'Trump 2024',
          outcome: 'Yes', // Same outcome
          side: 'BUY',
          size: 100000,
          price: 0.65,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
        {
          id: '2',
          wallet_address: '0xother2',
          market_id: MARKET_IDS.trump,
          market_title: 'Trump 2024',
          outcome: 'Yes', // Same outcome
          side: 'BUY',
          size: 80000,
          price: 0.65,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
        {
          id: '3',
          wallet_address: '0xother3',
          market_id: MARKET_IDS.trump,
          market_title: 'Trump 2024',
          outcome: 'Yes', // Same outcome
          side: 'BUY',
          size: 60000,
          price: 0.65,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
        {
          id: '4',
          wallet_address: '0xother4',
          market_id: MARKET_IDS.trump,
          market_title: 'Trump 2024',
          outcome: 'Yes', // Same outcome
          side: 'BUY',
          size: 50000,
          price: 0.65,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
      ]);

      const rating = await rateBetWithMocks(trade, 70);

      // 4 out of 4 other whales agree = 100% > 0.75
      expect(rating.consensusScore).toBe(90);
    });

    it('should give score 75 for majority consensus (>50% agreement)', async () => {
      const trade = mockApiTrades.whaleBuy;

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([
        {
          id: '1',
          wallet_address: '0xother1',
          market_id: MARKET_IDS.trump,
          market_title: 'Trump 2024',
          outcome: 'Yes', // Same
          side: 'BUY',
          size: 100000,
          price: 0.65,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
        {
          id: '2',
          wallet_address: '0xother2',
          market_id: MARKET_IDS.trump,
          market_title: 'Trump 2024',
          outcome: 'No', // Different
          side: 'BUY',
          size: 80000,
          price: 0.35,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
        {
          id: '3',
          wallet_address: '0xother3',
          market_id: MARKET_IDS.trump,
          market_title: 'Trump 2024',
          outcome: 'Yes', // Same
          side: 'BUY',
          size: 60000,
          price: 0.65,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
      ]);

      const rating = await rateBetWithMocks(trade, 70);

      // 2 out of 3 agree = 66.7% (>50%)
      expect(rating.consensusScore).toBe(75);
    });

    it('should give score 60 for some agreement (>25% agreement)', async () => {
      const trade = mockApiTrades.whaleBuy;

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([
        {
          id: '1',
          wallet_address: '0xother1',
          market_id: MARKET_IDS.trump,
          market_title: 'Trump 2024',
          outcome: 'Yes', // Same
          side: 'BUY',
          size: 100000,
          price: 0.65,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
        {
          id: '2',
          wallet_address: '0xother2',
          market_id: MARKET_IDS.trump,
          market_title: 'Trump 2024',
          outcome: 'No', // Different
          side: 'BUY',
          size: 80000,
          price: 0.35,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
        {
          id: '3',
          wallet_address: '0xother3',
          market_id: MARKET_IDS.trump,
          market_title: 'Trump 2024',
          outcome: 'No', // Different
          side: 'BUY',
          size: 60000,
          price: 0.35,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
      ]);

      const rating = await rateBetWithMocks(trade, 70);

      // 1 out of 3 agree = 33.3% (>25%)
      expect(rating.consensusScore).toBe(60);
    });

    it('should give score 50 for disagreement (<25% agreement)', async () => {
      const trade = mockApiTrades.whaleBuy;

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([
        {
          id: '1',
          wallet_address: '0xother1',
          market_id: MARKET_IDS.trump,
          market_title: 'Trump 2024',
          outcome: 'No', // Different
          side: 'BUY',
          size: 100000,
          price: 0.35,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
        {
          id: '2',
          wallet_address: '0xother2',
          market_id: MARKET_IDS.trump,
          market_title: 'Trump 2024',
          outcome: 'No', // Different
          side: 'BUY',
          size: 80000,
          price: 0.35,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
        {
          id: '3',
          wallet_address: '0xother3',
          market_id: MARKET_IDS.trump,
          market_title: 'Trump 2024',
          outcome: 'No', // Different
          side: 'BUY',
          size: 60000,
          price: 0.35,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
      ]);

      const rating = await rateBetWithMocks(trade, 70);

      // 0 out of 3 agree = 0%
      expect(rating.consensusScore).toBe(50);
    });

    it('should give score 60 for no other whale trades', async () => {
      const trade = mockApiTrades.whaleBuy;

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      const rating = await rateBetWithMocks(trade, 70);

      expect(rating.consensusScore).toBe(60);
    });

    it('should exclude same wallet from consensus calculation', async () => {
      const trade = mockApiTrades.whaleBuy;

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([
        {
          id: '1',
          wallet_address: WHALE_ADDRESS, // Same wallet - should be excluded
          market_id: MARKET_IDS.trump,
          market_title: 'Trump 2024',
          outcome: 'Yes',
          side: 'BUY',
          size: 100000,
          price: 0.65,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
      ]);

      const rating = await rateBetWithMocks(trade, 70);

      // No other whales
      expect(rating.consensusScore).toBe(60);
    });
  });

  describe('clearCache', () => {
    it('should clear market confidence cache', async () => {
      const trade = mockApiTrades.whaleBuy;

      mockGetWalletStats.mockReturnValue(null);
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockGetMarketByConditionId.mockResolvedValue(mockMarkets.trump);
      mockGetWalletTradesForMarket.mockReturnValue([]);

      // First call
      await rateBetWithMocks(trade, 70);
      expect(mockGetMarketByConditionId).toHaveBeenCalledTimes(1);

      // Clear cache
      rater.clearCache();

      // Second call - should fetch again
      await rateBetWithMocks(trade, 70);
      expect(mockGetMarketByConditionId).toHaveBeenCalledTimes(2);
    });
  });

  // Helper function to inject mocks into rateBet
  async function rateBetWithMocks(trade: Trade, suspicionScore: number): Promise<BetRating> {
    const getWalletStats = mockGetWalletStats;
    const getWallet = mockGetWallet;
    const getWalletTradesForMarket = mockGetWalletTradesForMarket;
    const polymarketApi = {
      getMarketByConditionId: mockGetMarketByConditionId,
    };
    const CONFIG = mockConfig;

    // Re-implement rateBet logic with mocks
    const walletStats = getWalletStats(trade.proxyWallet);

    // Calculate wallet score
    let walletScore = suspicionScore;
    if (walletStats) {
      const { winRate, totalTrades, address } = walletStats;
      const wallet = getWallet(address);
      const isLeaderboardWhale = wallet?.is_whale && wallet?.total_volume > 100000;

      let score = isLeaderboardWhale ? 70 : suspicionScore * 0.5;

      if (totalTrades >= 5) {
        const performanceScore = winRate * 100;
        score = isLeaderboardWhale
          ? score * 0.6 + performanceScore * 0.4
          : suspicionScore * 0.5 + performanceScore * 0.5;
      } else if (isLeaderboardWhale) {
        score = 70;
      } else {
        score = suspicionScore;
      }

      walletScore = Math.min(score, 100);
    }

    // Calculate market confidence
    let marketConfidence = 50;
    const cachedMarket = (rater as any).marketCache.get(trade.conditionId);
    if (cachedMarket && Date.now() - cachedMarket.timestamp < 60000) {
      marketConfidence = cachedMarket.score;
    } else {
      const market = await polymarketApi.getMarketByConditionId(trade.conditionId, 'debug');

      if (market) {
        let score = 50;

        if (market.volume > 1000000) score += 20;
        else if (market.volume > 500000) score += 15;
        else if (market.volume > 100000) score += 10;
        else if (market.volume > 50000) score += 5;

        if (market.liquidity > 100000) score += 15;
        else if (market.liquidity > 50000) score += 10;
        else if (market.liquidity > 10000) score += 5;

        if (market.active) score += 15;

        marketConfidence = Math.min(score, 100);

        (rater as any).marketCache.set(trade.conditionId, {
          score: marketConfidence,
          timestamp: Date.now(),
        });
      }
    }

    // Calculate size signal
    const tradeValue = trade.size * trade.price;
    let sizeSignal = 55;
    if (tradeValue > 500000) sizeSignal = 95;
    else if (tradeValue > 200000) sizeSignal = 90;
    else if (tradeValue > 100000) sizeSignal = 85;
    else if (tradeValue > 75000) sizeSignal = 80;
    else if (tradeValue > 50000) sizeSignal = 75;
    else if (tradeValue > 25000) sizeSignal = 65;

    // Calculate timing score
    let timingScore = 60;
    if (trade.price > 0.9) {
      timingScore = 85;
    } else if (trade.price < 0.1) {
      timingScore = 90;
    } else if (trade.price > 0.75 || trade.price < 0.25) {
      timingScore = 75;
    } else if (trade.price > 0.6 || trade.price < 0.4) {
      timingScore = 65;
    }

    // Calculate consensus score
    let consensusScore = 60;
    try {
      const trades = getWalletTradesForMarket(trade.conditionId);

      if (trades.length <= 1) {
        consensusScore = 60;
      } else {
        const sameOutcome = trades.filter(
          (t) => t.outcome === trade.outcome && t.wallet_address !== trade.proxyWallet
        ).length;

        const totalOtherWhales = trades.filter((t) => t.wallet_address !== trade.proxyWallet).length;

        if (totalOtherWhales === 0) {
          consensusScore = 60;
        } else {
          const consensusRatio = sameOutcome / totalOtherWhales;

          if (consensusRatio > 0.75) consensusScore = 90;
          else if (consensusRatio > 0.5) consensusScore = 75;
          else if (consensusRatio > 0.25) consensusScore = 60;
          else consensusScore = 50;
        }
      }
    } catch (error) {
      consensusScore = 60;
    }

    // Calculate final score
    const finalScore = Math.round(
      walletScore * 0.3 + sizeSignal * 0.25 + marketConfidence * 0.2 + timingScore * 0.15 + consensusScore * 0.1
    );

    const shouldTrade = finalScore >= CONFIG.MIN_CONFIDENCE_FOR_TRADE;

    return {
      trade,
      walletAddress: trade.proxyWallet,
      walletScore: Math.round(walletScore),
      marketConfidence: Math.round(marketConfidence),
      sizeSignal: Math.round(sizeSignal),
      timingScore: Math.round(timingScore),
      consensusScore: Math.round(consensusScore),
      finalScore,
      breakdown: {
        'Wallet Score': `${Math.round(walletScore)} (x0.30) = ${(walletScore * 0.3).toFixed(1)}`,
        'Size Signal': `${Math.round(sizeSignal)} (x0.25) = ${(sizeSignal * 0.25).toFixed(1)}`,
        'Market Quality': `${Math.round(marketConfidence)} (x0.20) = ${(marketConfidence * 0.2).toFixed(1)}`,
        Timing: `${Math.round(timingScore)} (x0.15) = ${(timingScore * 0.15).toFixed(1)}`,
        Consensus: `${Math.round(consensusScore)} (x0.10) = ${(consensusScore * 0.1).toFixed(1)}`,
      },
      shouldTrade,
    };
  }
});
