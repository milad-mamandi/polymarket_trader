import type {
  Trade,
  Position,
  Activity,
  PublicProfile,
  Market,
  TraderLeaderboardEntry,
  PriceData,
  ClosedPosition,
} from '../../src/services/polymarket/types.js';
import { mockApiTrades, largeTrades } from '../fixtures/trades.js';
import { mockMarkets, allMarkets, TOKEN_IDS, MARKET_IDS } from '../fixtures/markets.js';
import { WHALE_ADDRESS, NEW_SUSPICIOUS_ADDRESS } from '../fixtures/wallets.js';

/**
 * Mock Polymarket API for testing
 * Provides mock responses for all API endpoints
 */

export class MockPolymarketAPI {
  private _shouldFailLargeTrades = false;
  private _shouldFailProfile = false;
  private _largeTrades: Trade[] = largeTrades;

  /**
   * Configure mock behavior
   */
  setShouldFailLargeTrades(shouldFail: boolean): void {
    this._shouldFailLargeTrades = shouldFail;
  }

  setShouldFailProfile(shouldFail: boolean): void {
    this._shouldFailProfile = shouldFail;
  }

  setLargeTrades(trades: Trade[]): void {
    this._largeTrades = trades;
  }

  reset(): void {
    this._shouldFailLargeTrades = false;
    this._shouldFailProfile = false;
    this._largeTrades = largeTrades;
  }

  /**
   * Get large trades (whale detection)
   */
  async getLargeTrades(minAmount = 10000, limit = 100): Promise<Trade[]> {
    if (this._shouldFailLargeTrades) {
      throw new Error('Mock API error: Failed to fetch large trades');
    }

    // Filter trades by minimum amount
    return this._largeTrades
      .filter((trade) => trade.size * trade.price >= minAmount)
      .slice(0, limit);
  }

  /**
   * Get user's public profile
   */
  async getPublicProfile(address: string): Promise<PublicProfile | null> {
    if (this._shouldFailProfile) {
      throw new Error('Mock API error: Failed to fetch profile');
    }

    // Return mock profiles based on address
    if (address === WHALE_ADDRESS) {
      return {
        createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        proxyWallet: WHALE_ADDRESS,
        profileImage: 'https://example.com/whale.jpg',
        displayUsernamePublic: true,
        bio: 'Professional trader with deep pockets',
        pseudonym: 'BigSpender',
        name: 'Whale Trader',
        users: [{ id: '1', creator: false, mod: false }],
        xUsername: 'whale_trader',
        verifiedBadge: true,
      };
    }

    if (address === NEW_SUSPICIOUS_ADDRESS) {
      return {
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        proxyWallet: NEW_SUSPICIOUS_ADDRESS,
        profileImage: null,
        displayUsernamePublic: false,
        bio: null,
        pseudonym: 'NewUser',
        name: null,
        users: null,
        xUsername: null,
        verifiedBadge: false,
      };
    }

    // Return null for unknown addresses (profile not found)
    return null;
  }

  /**
   * Get user's current positions
   */
  async getUserPositions(address: string): Promise<Position[]> {
    // Return empty array for tests (can be enhanced later)
    return [];
  }

  /**
   * Get user's recent activity
   */
  async getUserActivity(address: string, limit = 50): Promise<Activity[]> {
    // Return empty array for tests (can be enhanced later)
    return [];
  }

  /**
   * Get user's closed positions
   */
  async getClosedPositions(address: string, limit = 50): Promise<ClosedPosition[]> {
    // Return empty array for tests (can be enhanced later)
    return [];
  }

  /**
   * Get market by condition ID
   */
  async getMarketByConditionId(conditionId: string): Promise<Market | null> {
    const market = Object.values(mockMarkets).find((m) => m.conditionId === conditionId);
    return market || null;
  }

  /**
   * Get market by slug
   */
  async getMarketBySlug(slug: string): Promise<Market | null> {
    const market = Object.values(mockMarkets).find((m) => m.slug === slug);
    return market || null;
  }

  /**
   * Get all active markets
   */
  async getActiveMarkets(limit = 100): Promise<Market[]> {
    return allMarkets.filter((m) => m.active).slice(0, limit);
  }

  /**
   * Get trader leaderboard
   */
  async getTraderLeaderboard(
    period: 'daily' | 'weekly' | 'monthly' = 'daily',
    limit = 100
  ): Promise<TraderLeaderboardEntry[]> {
    // Return mock leaderboard data
    return [
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
    ];
  }

  /**
   * Get price history for a market
   */
  async getPriceHistory(
    conditionId: string,
    interval: '1m' | '1h' | '1d' = '1h',
    startTs?: number,
    endTs?: number
  ): Promise<PriceData[]> {
    // Return mock price data
    const now = Date.now();
    return [
      { price: 0.50, timestamp: now - 7200000 }, // 2 hours ago
      { price: 0.55, timestamp: now - 3600000 }, // 1 hour ago
      { price: 0.60, timestamp: now }, // now
    ];
  }

  /**
   * Get current price for a market
   */
  async getCurrentPrice(conditionId: string): Promise<number | null> {
    const market = await this.getMarketByConditionId(conditionId);
    if (!market || !market.outcomePrices || market.outcomePrices.length === 0) {
      return null;
    }
    return parseFloat(market.outcomePrices[0]);
  }
}

/**
 * Create a mock instance for tests
 */
export function createMockPolymarketAPI(): MockPolymarketAPI {
  return new MockPolymarketAPI();
}

/**
 * Default mock instance
 */
export const mockPolymarketApi = createMockPolymarketAPI();
