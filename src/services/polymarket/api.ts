import axios, { AxiosInstance, AxiosError } from 'axios';
import { CONFIG } from '../../config/settings.js';
import { logger } from '../../utils/logger.js';
import {
  Trade,
  Position,
  Activity,
  PublicProfile,
  Market,
  TraderLeaderboardEntry,
  PriceData,
  ClosedPosition,
} from './types.js';

/**
 * Helper to safely log Axios errors without circular references
 */
function logAxiosError(context: string, error: unknown): void {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    logger.error(`${context}: ${axiosError.message}`, {
      status: axiosError.response?.status,
      statusText: axiosError.response?.statusText,
      url: axiosError.config?.url,
    });
  } else {
    logger.error(`${context}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Polymarket API Client
 * Handles all REST API calls to Data API, Gamma API, and CLOB API
 */
export class PolymarketAPI {
  private dataApi: AxiosInstance;
  private gammaApi: AxiosInstance;
  private clobApi: AxiosInstance;

  constructor() {
    this.dataApi = axios.create({
      baseURL: CONFIG.DATA_API,
      timeout: 10000,
    });

    this.gammaApi = axios.create({
      baseURL: CONFIG.GAMMA_API,
      timeout: 10000,
    });

    this.clobApi = axios.create({
      baseURL: CONFIG.CLOB_API,
      timeout: 10000,
    });
  }

  /**
   * Get large trades (whale detection)
   */
  async getLargeTrades(minAmount: number = CONFIG.WHALE_THRESHOLD_USD, limit = 100): Promise<Trade[]> {
    try {
      const response = await this.dataApi.get<Trade[]>('/trades', {
        params: {
          filterType: 'CASH',
          filterAmount: minAmount,
          limit,
          offset: 0,
          takerOnly: true,
        },
      });
      return response.data;
    } catch (error) {
      logAxiosError('Error fetching large trades', error);
      return [];
    }
  }

  /**
   * Get user's public profile
   */
  async getPublicProfile(address: string): Promise<PublicProfile | null> {
    try {
      const response = await this.gammaApi.get<PublicProfile>('/public-profile', {
        params: { address },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null; // Profile not found
      }
      logAxiosError(`Error fetching profile for ${address}`, error);
      return null;
    }
  }

  /**
   * Get user's current positions
   */
  async getUserPositions(address: string): Promise<Position[]> {
    try {
      const response = await this.dataApi.get<Position[]>('/positions', {
        params: {
          user: address,
          limit: 500,
        },
      });
      return response.data;
    } catch (error) {
      logAxiosError(`Error fetching positions for ${address}`, error);
      return [];
    }
  }

  /**
   * Get user's closed positions (resolved markets with realized P&L)
   * This is useful for checking if a market has been resolved when the /markets endpoint returns 422
   */
  async getClosedPositions(address: string, conditionId?: string): Promise<ClosedPosition[]> {
    try {
      const params: any = {
        user: address,
        limit: 50,
      };
      
      if (conditionId) {
        params.market = conditionId;
      }
      
      const response = await this.dataApi.get<ClosedPosition[]>('/closed-positions', { params });
      return response.data;
    } catch (error) {
      logAxiosError(`Error fetching closed positions for ${address}`, error);
      return [];
    }
  }

  /**
   * Get user's activity/trade history
   */
  async getUserActivity(address: string, limit = 100): Promise<Activity[]> {
    try {
      const response = await this.dataApi.get<Activity[]>('/activity', {
        params: {
          user: address,
          limit,
          type: 'TRADE',
        },
      });
      return response.data;
    } catch (error) {
      logAxiosError(`Error fetching activity for ${address}`, error);
      return [];
    }
  }

  /**
   * Get trader leaderboard
   */
  async getLeaderboard(
    category: string = 'OVERALL',
    timePeriod: string = 'DAY',
    orderBy: string = 'PNL',
    limit = 50
  ): Promise<TraderLeaderboardEntry[]> {
    try {
      const response = await this.dataApi.get<TraderLeaderboardEntry[]>('/v1/leaderboard', {
        params: {
          category,
          timePeriod,
          orderBy,
          limit,
        },
      });
      return response.data;
    } catch (error) {
      logAxiosError('Error fetching leaderboard', error);
      return [];
    }
  }

  /**
   * Get market details by condition ID
   */
  async getMarketByConditionId(conditionId: string, logLevel?: string): Promise<Market | null> {
    try {
      const response = await this.gammaApi.get<Market>(`/markets/${conditionId}`);
      return response.data;
    } catch (error) {
      // Handle 422 with configurable log level (market likely resolved/archived)
      if (axios.isAxiosError(error) && error.response?.status === 422) {
        const level = logLevel || CONFIG.ERROR_LOG_LEVEL_422;
        const message = `Market ${conditionId} unavailable (likely resolved/archived)`;
        
        switch(level) {
          case 'error':
            logger.error(message);
            break;
          case 'warn':
            logger.warn(message);
            break;
          case 'info':
            logger.info(message);
            break;
          case 'debug':
            logger.debug(message);
            break;
        }
        
        return null;
      }
      
      // Log other errors normally
      logAxiosError(`Error fetching market ${conditionId}`, error);
      return null;
    }
  }

  /**
   * Get all active markets
   */
  async getMarkets(limit = 100, offset = 0): Promise<Market[]> {
    try {
      const response = await this.gammaApi.get<Market[]>('/markets', {
        params: {
          limit,
          offset,
          active: true,
        },
      });
      return response.data;
    } catch (error) {
      logAxiosError('Error fetching markets', error);
      return [];
    }
  }

  /**
   * Get current price for a token
   */
  async getTokenPrice(tokenId: string): Promise<number | null> {
    try {
      const response = await this.clobApi.get<{ price: string }>('/price', {
        params: {
          token_id: tokenId,
          side: 'BUY',
        },
      });
      return parseFloat(response.data.price);
    } catch (error) {
      logAxiosError(`Error fetching price for token ${tokenId}`, error);
      return null;
    }
  }

  /**
   * Get midpoint price for a token
   */
  async getMidpointPrice(tokenId: string): Promise<number | null> {
    try {
      const response = await this.clobApi.get<{ mid: string }>('/midpoint', {
        params: {
          token_id: tokenId,
        },
      });
      return parseFloat(response.data.mid);
    } catch (error) {
      logAxiosError(`Error fetching midpoint price for token ${tokenId}`, error);
      return null;
    }
  }

  /**
   * Search for markets, events, and profiles
   */
  async search(query: string): Promise<any> {
    try {
      const response = await this.gammaApi.get('/search', {
        params: { q: query },
      });
      return response.data;
    } catch (error) {
      logAxiosError(`Error searching for "${query}"`, error);
      return null;
    }
  }

  /**
   * Get top markets by volume for WebSocket subscription
   * Returns asset IDs (token IDs) to subscribe to
   */
  async getTopMarketAssetIds(limit = 50): Promise<string[]> {
    try {
      const markets = await this.getMarkets(limit, 0);
      const assetIds: string[] = [];

      for (const market of markets) {
        if (market.tokens && Array.isArray(market.tokens)) {
          // Add all token IDs from the market
          market.tokens.forEach((token: any) => {
            if (token.token_id) {
              assetIds.push(token.token_id);
            }
          });
        }
      }

      logger.info(`Found ${assetIds.length} asset IDs from ${markets.length} markets for WebSocket subscription`);
      return assetIds;
    } catch (error) {
      logAxiosError('Error fetching top market asset IDs', error);
      return [];
    }
  }
}

// Export singleton instance
export const polymarketApi = new PolymarketAPI();
