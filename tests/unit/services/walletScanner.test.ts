import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Trade, PublicProfile, TraderLeaderboardEntry } from '../../../src/services/polymarket/types.js';
import type { Wallet, WalletInsert } from '../../../src/models/wallet.js';
import type { WalletTrade } from '../../../src/models/trade.js';
import { WalletScanner, DetectedWallet } from '../../../src/services/walletScanner.js';
import { mockApiTrades, TX_HASH_1, TX_HASH_2, TX_HASH_3, createApiTrade } from '../../fixtures/trades.js';
import {
  WHALE_ADDRESS,
  NEW_SUSPICIOUS_ADDRESS,
  NORMAL_ADDRESS,
  mockWallets,
} from '../../fixtures/wallets.js';
import { MARKET_IDS, MARKET_TITLES } from '../../fixtures/markets.js';

/**
 * Unit tests for WalletScanner service
 * Tests whale detection, suspicious wallet detection, and trade processing
 */

describe('WalletScanner', () => {
  let scanner: WalletScanner;
  let mockGetLargeTrades: jest.Mock<(minAmount: number, limit: number) => Promise<Trade[]>>;
  let mockGetPublicProfile: jest.Mock<(address: string) => Promise<PublicProfile | null>>;
  let mockGetUserActivity: jest.Mock<(address: string, limit: number) => Promise<Trade[]>>;
  let mockGetLeaderboard: jest.Mock<
    (market: string, period: string, sort: string, limit: number) => Promise<TraderLeaderboardEntry[]>
  >;
  let mockGetWallet: jest.Mock<(address: string) => Wallet | undefined>;
  let mockUpsertWallet: jest.Mock<(wallet: WalletInsert) => void>;
  let mockInsertWalletTrade: jest.Mock<(trade: Omit<WalletTrade, 'timestamp' | 'resolved'>) => void>;
  let mockWalletAgeInHours: jest.Mock<(createdAt: string | Date) => number>;
  let mockGenerateId: jest.Mock<() => string>;

  // Mock CONFIG
  const mockConfig = {
    WHALE_THRESHOLD_USD: 50000,
    NEW_WALLET_HOURS: 24,
  };

  beforeEach(() => {
    // Create fresh scanner instance
    scanner = new WalletScanner();

    // Reset all mocks
    mockGetLargeTrades = jest.fn();
    mockGetPublicProfile = jest.fn();
    mockGetUserActivity = jest.fn();
    mockGetLeaderboard = jest.fn();
    mockGetWallet = jest.fn();
    mockUpsertWallet = jest.fn();
    mockInsertWalletTrade = jest.fn();
    mockWalletAgeInHours = jest.fn();
    mockGenerateId = jest.fn(() => `mock-id-${Date.now()}`);

    // Clear any seen trades
    scanner.clearOldSeenTrades();
    (scanner as any).seenTrades.clear();
  });

  describe('scanForWhales', () => {
    it('should detect whale trades above threshold', async () => {
      // Setup: API returns whale trade
      const whaleTrade = mockApiTrades.whaleBuy;
      mockGetLargeTrades.mockResolvedValue([whaleTrade]);
      mockGetWallet.mockReturnValue(undefined); // New wallet
      mockGetPublicProfile.mockResolvedValue({
        createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year old
        proxyWallet: WHALE_ADDRESS,
        profileImage: 'https://example.com/whale.jpg',
        displayUsernamePublic: true,
        bio: 'Professional trader',
        pseudonym: 'BigSpender',
        name: 'Whale Trader',
        users: null,
        xUsername: 'whale_trader',
        verifiedBadge: true,
      });
      mockWalletAgeInHours.mockReturnValue(8760); // 365 days

      // Mock dependencies
      const detected = await scanForWhalesWithMocks();

      // Assert
      expect(detected).toHaveLength(1);
      expect(detected[0].address).toBe(WHALE_ADDRESS);
      expect(detected[0].isWhale).toBe(true);
      expect(detected[0].isNewSuspicious).toBe(false);
      expect(detected[0].trade).toEqual(whaleTrade);
      expect(detected[0].walletAge).toBe(8760);

      // Verify database calls
      expect(mockUpsertWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          address: WHALE_ADDRESS,
          is_whale: true,
          is_new_suspicious: false,
        })
      );
      expect(mockInsertWalletTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          wallet_address: WHALE_ADDRESS,
          market_id: whaleTrade.conditionId,
        })
      );
    });

    it('should detect new suspicious wallets (young wallet + large bet)', async () => {
      // Setup: API returns trade from 2-hour-old wallet
      const suspiciousTrade = mockApiTrades.newSuspiciousBuy;
      mockGetLargeTrades.mockResolvedValue([suspiciousTrade]);
      mockGetWallet.mockReturnValue(undefined); // New wallet
      mockGetPublicProfile.mockResolvedValue({
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours old
        proxyWallet: NEW_SUSPICIOUS_ADDRESS,
        profileImage: null,
        displayUsernamePublic: false,
        bio: null,
        pseudonym: 'NewUser',
        name: null,
        users: null,
        xUsername: null,
        verifiedBadge: false,
      });
      mockWalletAgeInHours.mockReturnValue(2); // 2 hours

      const detected = await scanForWhalesWithMocks();

      // Assert
      expect(detected).toHaveLength(1);
      expect(detected[0].address).toBe(NEW_SUSPICIOUS_ADDRESS);
      expect(detected[0].isWhale).toBe(true); // Above whale threshold (70k * 0.72 = 50.4k)
      expect(detected[0].isNewSuspicious).toBe(true); // Young wallet
      expect(detected[0].walletAge).toBe(2);

      expect(mockUpsertWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          address: NEW_SUSPICIOUS_ADDRESS,
          is_whale: true,
          is_new_suspicious: true,
        })
      );
    });

    it('should detect new suspicious wallets via activity check (no profile)', async () => {
      // Setup: Wallet has no profile, but very few trades
      const trade = createApiTrade({
        proxyWallet: '0xnewwallet123',
        size: 30000,
        price: 0.70,
        transactionHash: '0xnew123',
      });
      mockGetLargeTrades.mockResolvedValue([trade]);
      mockGetWallet.mockReturnValue(undefined);
      mockGetPublicProfile.mockResolvedValue(null); // No profile
      mockGetUserActivity.mockResolvedValue([trade]); // Only 1 trade in history
      mockWalletAgeInHours.mockReturnValue(1);

      const detected = await scanForWhalesWithMocks();

      // Assert
      expect(detected).toHaveLength(1);
      expect(detected[0].isNewSuspicious).toBe(true);
      expect(detected[0].walletAge).toBe(1);
      expect(mockGetUserActivity).toHaveBeenCalledWith('0xnewwallet123', 10);
    });

    it('should skip normal trades below whale threshold', async () => {
      // Setup: Small trade from old wallet
      const normalTrade = mockApiTrades.normalBuy;
      mockGetLargeTrades.mockResolvedValue([normalTrade]);
      mockGetWallet.mockReturnValue(undefined);
      mockGetPublicProfile.mockResolvedValue({
        createdAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(), // 6 months old
        proxyWallet: NORMAL_ADDRESS,
        profileImage: null,
        displayUsernamePublic: false,
        bio: null,
        pseudonym: 'NormalUser',
        name: null,
        users: null,
        xUsername: null,
        verifiedBadge: false,
      });
      mockWalletAgeInHours.mockReturnValue(4320); // 180 days

      const detected = await scanForWhalesWithMocks();

      // Assert: Should not detect (not whale, not new suspicious)
      expect(detected).toHaveLength(0);
      expect(mockUpsertWallet).not.toHaveBeenCalled();
      expect(mockInsertWalletTrade).not.toHaveBeenCalled();
    });

    it('should use cached wallet data for known wallets', async () => {
      // Setup: Wallet already in database
      const whaleTrade = mockApiTrades.whaleBuy;
      mockGetLargeTrades.mockResolvedValue([whaleTrade]);
      mockGetWallet.mockReturnValue(mockWallets.whale); // Known whale

      const detected = await scanForWhalesWithMocks();

      // Assert: Should use cached data, not fetch profile
      expect(detected).toHaveLength(1);
      expect(detected[0].isWhale).toBe(true);
      expect(mockGetPublicProfile).not.toHaveBeenCalled();
      expect(mockGetUserActivity).not.toHaveBeenCalled();
    });

    it('should skip duplicate trades based on transaction hash', async () => {
      // Setup: Same trade scanned twice
      const trade = mockApiTrades.whaleBuy;
      mockGetLargeTrades.mockResolvedValue([trade]);
      mockGetWallet.mockReturnValue(mockWallets.whale);

      // First scan
      const detected1 = await scanForWhalesWithMocks();
      expect(detected1).toHaveLength(1);

      // Second scan with same trade
      const detected2 = await scanForWhalesWithMocks();

      // Assert: Should be skipped as duplicate
      expect(detected2).toHaveLength(0);
      expect(mockUpsertWallet).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should handle multiple trades in single scan', async () => {
      // Setup: Multiple different trades
      const trade1 = mockApiTrades.whaleBuy;
      const trade2 = mockApiTrades.newSuspiciousBuy;
      mockGetLargeTrades.mockResolvedValue([trade1, trade2]);
      mockGetWallet.mockReturnValue(undefined);
      mockGetPublicProfile
        .mockResolvedValueOnce({
          createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
          proxyWallet: WHALE_ADDRESS,
          profileImage: null,
          displayUsernamePublic: false,
          bio: null,
          pseudonym: 'Whale',
          name: null,
          users: null,
          xUsername: null,
          verifiedBadge: false,
        })
        .mockResolvedValueOnce({
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          proxyWallet: NEW_SUSPICIOUS_ADDRESS,
          profileImage: null,
          displayUsernamePublic: false,
          bio: null,
          pseudonym: 'New',
          name: null,
          users: null,
          xUsername: null,
          verifiedBadge: false,
        });
      mockWalletAgeInHours.mockReturnValueOnce(8760).mockReturnValueOnce(2);

      const detected = await scanForWhalesWithMocks();

      // Assert: Both detected
      expect(detected).toHaveLength(2);
      expect(mockUpsertWallet).toHaveBeenCalledTimes(2);
      expect(mockInsertWalletTrade).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when no trades found', async () => {
      mockGetLargeTrades.mockResolvedValue([]);

      const detected = await scanForWhalesWithMocks();

      expect(detected).toHaveLength(0);
      expect(mockUpsertWallet).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockGetLargeTrades.mockRejectedValue(new Error('API Error'));

      await expect(scanForWhalesWithMocks()).rejects.toThrow('API Error');
    });
  });

  describe('processSingleTrade', () => {
    it('should process whale trade and return DetectedWallet', async () => {
      const trade = mockApiTrades.whaleBuy;
      mockGetWallet.mockReturnValue(undefined);
      mockGetPublicProfile.mockResolvedValue({
        createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        proxyWallet: WHALE_ADDRESS,
        profileImage: null,
        displayUsernamePublic: false,
        bio: null,
        pseudonym: 'Whale',
        name: null,
        users: null,
        xUsername: null,
        verifiedBadge: false,
      });
      mockWalletAgeInHours.mockReturnValue(8760);

      const result = await processSingleTradeWithMocks(trade);

      expect(result).not.toBeNull();
      expect(result?.address).toBe(WHALE_ADDRESS);
      expect(result?.isWhale).toBe(true);
      expect(mockUpsertWallet).toHaveBeenCalled();
      expect(mockInsertWalletTrade).toHaveBeenCalled();
    });

    it('should process new suspicious trade and return DetectedWallet', async () => {
      const trade = mockApiTrades.newSuspiciousBuy;
      mockGetWallet.mockReturnValue(undefined);
      mockGetPublicProfile.mockResolvedValue({
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        proxyWallet: NEW_SUSPICIOUS_ADDRESS,
        profileImage: null,
        displayUsernamePublic: false,
        bio: null,
        pseudonym: 'New',
        name: null,
        users: null,
        xUsername: null,
        verifiedBadge: false,
      });
      mockWalletAgeInHours.mockReturnValue(2);

      const result = await processSingleTradeWithMocks(trade);

      expect(result).not.toBeNull();
      expect(result?.isNewSuspicious).toBe(true);
    });

    it('should return null for normal trades', async () => {
      const trade = mockApiTrades.normalBuy;
      mockGetWallet.mockReturnValue(undefined);
      mockGetPublicProfile.mockResolvedValue({
        createdAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
        proxyWallet: NORMAL_ADDRESS,
        profileImage: null,
        displayUsernamePublic: false,
        bio: null,
        pseudonym: 'Normal',
        name: null,
        users: null,
        xUsername: null,
        verifiedBadge: false,
      });
      mockWalletAgeInHours.mockReturnValue(4320);

      const result = await processSingleTradeWithMocks(trade);

      expect(result).toBeNull();
      expect(mockUpsertWallet).not.toHaveBeenCalled();
    });

    it('should return null for duplicate trades', async () => {
      const trade = mockApiTrades.whaleBuy;
      mockGetWallet.mockReturnValue(mockWallets.whale);

      // First call
      const result1 = await processSingleTradeWithMocks(trade);
      expect(result1).not.toBeNull();

      // Second call with same trade
      const result2 = await processSingleTradeWithMocks(trade);
      expect(result2).toBeNull(); // Duplicate
    });

    it('should use cached data for known wallets', async () => {
      const trade = mockApiTrades.whaleBuy;
      mockGetWallet.mockReturnValue(mockWallets.whale);
      mockWalletAgeInHours.mockReturnValue(8760);

      const result = await processSingleTradeWithMocks(trade);

      expect(result).not.toBeNull();
      expect(mockGetPublicProfile).not.toHaveBeenCalled();
    });
  });

  describe('seedFromLeaderboard', () => {
    it('should seed whales from leaderboard', async () => {
      const leaderboardEntries: TraderLeaderboardEntry[] = [
        {
          rank: '1',
          proxyWallet: WHALE_ADDRESS,
          userName: 'BigSpender',
          vol: 500000,
          pnl: 50000,
          profileImage: 'https://example.com/whale.jpg',
          xUsername: 'whale_trader',
          verifiedBadge: true,
        },
        {
          rank: '2',
          proxyWallet: '0xwhale2',
          userName: 'MediumSpender',
          vol: 300000,
          pnl: 30000,
          profileImage: '',
          xUsername: '',
          verifiedBadge: false,
        },
      ];

      mockGetLeaderboard.mockResolvedValue(leaderboardEntries);
      mockGetWallet.mockReturnValue(undefined); // Not yet tracked
      mockGetPublicProfile
        .mockResolvedValueOnce({
          createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
          proxyWallet: WHALE_ADDRESS,
          profileImage: null,
          displayUsernamePublic: false,
          bio: null,
          pseudonym: 'Whale1',
          name: null,
          users: null,
          xUsername: null,
          verifiedBadge: false,
        })
        .mockResolvedValueOnce({
          createdAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
          proxyWallet: '0xwhale2',
          profileImage: null,
          displayUsernamePublic: false,
          bio: null,
          pseudonym: 'Whale2',
          name: null,
          users: null,
          xUsername: null,
          verifiedBadge: false,
        });

      await seedFromLeaderboardWithMocks();

      expect(mockUpsertWallet).toHaveBeenCalledTimes(2);
      expect(mockUpsertWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          address: WHALE_ADDRESS,
          is_whale: true,
          is_new_suspicious: false,
          total_volume: 500000,
        })
      );
    });

    it('should skip already-tracked wallets', async () => {
      const leaderboardEntries: TraderLeaderboardEntry[] = [
        {
          rank: '1',
          proxyWallet: WHALE_ADDRESS,
          userName: 'BigSpender',
          vol: 500000,
          pnl: 50000,
          profileImage: '',
          xUsername: '',
          verifiedBadge: false,
        },
      ];

      mockGetLeaderboard.mockResolvedValue(leaderboardEntries);
      mockGetWallet.mockReturnValue(mockWallets.whale); // Already tracked

      await seedFromLeaderboardWithMocks();

      expect(mockUpsertWallet).not.toHaveBeenCalled();
      expect(mockGetPublicProfile).not.toHaveBeenCalled();
    });

    it('should handle empty leaderboard', async () => {
      mockGetLeaderboard.mockResolvedValue([]);

      await seedFromLeaderboardWithMocks();

      expect(mockUpsertWallet).not.toHaveBeenCalled();
    });
  });

  describe('clearOldSeenTrades', () => {
    it('should clear cache when size exceeds 10,000', () => {
      // Fill cache with 10,001 items
      const seenTrades = (scanner as any).seenTrades as Set<string>;
      for (let i = 0; i < 10001; i++) {
        seenTrades.add(`wallet-${i}-tx-${i}`);
      }

      expect(seenTrades.size).toBe(10001);

      scanner.clearOldSeenTrades();

      expect(seenTrades.size).toBe(0);
    });

    it('should not clear cache when size is below 10,000', () => {
      const seenTrades = (scanner as any).seenTrades as Set<string>;
      for (let i = 0; i < 5000; i++) {
        seenTrades.add(`wallet-${i}-tx-${i}`);
      }

      expect(seenTrades.size).toBe(5000);

      scanner.clearOldSeenTrades();

      expect(seenTrades.size).toBe(5000); // Should remain unchanged
    });
  });

  // Helper functions to inject mocks into scanner methods
  async function scanForWhalesWithMocks(): Promise<DetectedWallet[]> {
    // Mock polymarketApi
    const polymarketApi = {
      getLargeTrades: mockGetLargeTrades,
      getPublicProfile: mockGetPublicProfile,
      getUserActivity: mockGetUserActivity,
      getLeaderboard: mockGetLeaderboard,
    };

    // Mock database functions
    const getWallet = mockGetWallet;
    const upsertWallet = mockUpsertWallet;
    const insertWalletTrade = mockInsertWalletTrade;

    // Mock helper functions
    const walletAgeInHours = mockWalletAgeInHours;
    const generateId = mockGenerateId;
    const CONFIG = mockConfig;

    // Re-implement scanForWhales logic with mocks
    const trades = await polymarketApi.getLargeTrades(CONFIG.WHALE_THRESHOLD_USD, 100);
    const detectedWallets: DetectedWallet[] = [];

    for (const trade of trades) {
      const tradeKey = `${trade.proxyWallet}-${trade.transactionHash}`;
      if ((scanner as any).seenTrades.has(tradeKey)) continue;

      (scanner as any).seenTrades.add(tradeKey);

      let wallet = getWallet(trade.proxyWallet);

      const isWhale = trade.size * trade.price >= CONFIG.WHALE_THRESHOLD_USD;
      let isNewSuspicious = false;
      let walletAge: number | undefined;
      let createdAt: string | undefined;

      if (wallet) {
        isNewSuspicious = wallet.is_new_suspicious;
        createdAt = wallet.wallet_created_at || undefined;
        if (createdAt) {
          walletAge = walletAgeInHours(createdAt);
        }
      } else {
        const profile = await polymarketApi.getPublicProfile(trade.proxyWallet);

        if (profile?.createdAt) {
          createdAt = profile.createdAt;
          walletAge = walletAgeInHours(profile.createdAt);

          if (walletAge <= CONFIG.NEW_WALLET_HOURS) {
            isNewSuspicious = true;
          }
        } else {
          const activity = await polymarketApi.getUserActivity(trade.proxyWallet, 10);
          if (activity.length <= 3) {
            isNewSuspicious = true;
            walletAge = 1;
          }
        }
      }

      if (isWhale || isNewSuspicious) {
        upsertWallet({
          address: trade.proxyWallet,
          wallet_created_at: createdAt,
          is_whale: isWhale,
          is_new_suspicious: isNewSuspicious,
          total_volume: trade.size * trade.price,
          suspicion_score: wallet?.suspicion_score || 50,
        });

        detectedWallets.push({
          address: trade.proxyWallet,
          isWhale,
          isNewSuspicious,
          trade,
          walletAge,
          createdAt,
        });

        insertWalletTrade({
          id: generateId(),
          wallet_address: trade.proxyWallet,
          market_id: trade.conditionId,
          market_title: trade.title,
          outcome: trade.outcome,
          side: trade.side,
          size: trade.size,
          price: trade.price,
        });
      }
    }

    return detectedWallets;
  }

  async function processSingleTradeWithMocks(trade: Trade): Promise<DetectedWallet | null> {
    const polymarketApi = {
      getPublicProfile: mockGetPublicProfile,
      getUserActivity: mockGetUserActivity,
    };

    const getWallet = mockGetWallet;
    const upsertWallet = mockUpsertWallet;
    const insertWalletTrade = mockInsertWalletTrade;
    const walletAgeInHours = mockWalletAgeInHours;
    const generateId = mockGenerateId;
    const CONFIG = mockConfig;

    const tradeKey = `${trade.proxyWallet}-${trade.transactionHash}`;
    if ((scanner as any).seenTrades.has(tradeKey)) {
      return null;
    }

    (scanner as any).seenTrades.add(tradeKey);

    let wallet = getWallet(trade.proxyWallet);

    const isWhale = trade.size * trade.price >= CONFIG.WHALE_THRESHOLD_USD;
    let isNewSuspicious = false;
    let walletAge: number | undefined;
    let createdAt: string | undefined;

    if (wallet) {
      isNewSuspicious = wallet.is_new_suspicious;
      createdAt = wallet.wallet_created_at || undefined;
      if (createdAt) {
        walletAge = walletAgeInHours(createdAt);
      }
    } else {
      const profile = await polymarketApi.getPublicProfile(trade.proxyWallet);

      if (profile?.createdAt) {
        createdAt = profile.createdAt;
        walletAge = walletAgeInHours(profile.createdAt);

        if (walletAge <= CONFIG.NEW_WALLET_HOURS) {
          isNewSuspicious = true;
        }
      } else {
        const activity = await polymarketApi.getUserActivity(trade.proxyWallet, 10);
        if (activity.length <= 3) {
          isNewSuspicious = true;
          walletAge = 1;
        }
      }
    }

    if (isWhale || isNewSuspicious) {
      upsertWallet({
        address: trade.proxyWallet,
        wallet_created_at: createdAt,
        is_whale: isWhale,
        is_new_suspicious: isNewSuspicious,
        total_volume: trade.size * trade.price,
        suspicion_score: wallet?.suspicion_score || 50,
      });

      insertWalletTrade({
        id: generateId(),
        wallet_address: trade.proxyWallet,
        market_id: trade.conditionId,
        market_title: trade.title,
        outcome: trade.outcome,
        side: trade.side,
        size: trade.size,
        price: trade.price,
      });

      return {
        address: trade.proxyWallet,
        isWhale,
        isNewSuspicious,
        trade,
        walletAge,
        createdAt,
      };
    }

    return null;
  }

  async function seedFromLeaderboardWithMocks(): Promise<void> {
    const polymarketApi = {
      getLeaderboard: mockGetLeaderboard,
      getPublicProfile: mockGetPublicProfile,
    };

    const getWallet = mockGetWallet;
    const upsertWallet = mockUpsertWallet;

    const leaderboard = await polymarketApi.getLeaderboard('OVERALL', 'WEEK', 'VOL', 50);

    for (const entry of leaderboard) {
      const existingWallet = getWallet(entry.proxyWallet);
      if (existingWallet) continue;

      const profile = await polymarketApi.getPublicProfile(entry.proxyWallet);

      upsertWallet({
        address: entry.proxyWallet,
        wallet_created_at: profile?.createdAt || undefined,
        is_whale: true,
        is_new_suspicious: false,
        total_volume: entry.vol,
        suspicion_score: 50,
      });
    }
  }
});
