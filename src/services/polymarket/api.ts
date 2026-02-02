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
  
  // Cache conditionId -> slug mapping for faster lookups
  // This is populated from trades which include both conditionId and slug
  private conditionIdToSlugCache: Map<string, string> = new Map();

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
   * Cache a conditionId -> slug mapping for faster market lookups
   * Called automatically when processing trades
   */
  cacheConditionIdSlug(conditionId: string, slug: string): void {
    if (conditionId && slug) {
      this.conditionIdToSlugCache.set(conditionId, slug);
    }
  }
  
  /**
   * Get cached slug for a conditionId
   */
  getCachedSlug(conditionId: string): string | undefined {
    return this.conditionIdToSlugCache.get(conditionId);
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
   * Get recent large trades with time filtering
   * Filters trades to only return those within the specified time window
   */
  async getRecentLargeTrades(
    minAmount: number = CONFIG.WHALE_THRESHOLD_USD,
    maxAgeHours: number = CONFIG.TRADE_MAX_AGE_HOURS,
    limit = 100
  ): Promise<Trade[]> {
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
      
      // Post-fetch time filtering (Data API doesn't support before/after params)
      // NOTE: API returns timestamp in SECONDS, so we convert to milliseconds
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      const recentTrades = response.data.filter(trade => {
        // Convert seconds to milliseconds for comparison
        const tradeTimeMs = trade.timestamp * 1000;
        return tradeTimeMs >= cutoffTime;
      });
      
      logger.info(`Fetched ${response.data.length} trades, ${recentTrades.length} within last ${maxAgeHours}h`);
      return recentTrades;
    } catch (error) {
      logAxiosError('Error fetching recent large trades', error);
      return [];
    }
  }

  /**
   * Get top active markets sorted by volume
   * Only returns markets that are active, not closed, and have sufficient time remaining
   */
  async getTopActiveMarkets(limit: number = CONFIG.ACTIVE_MARKETS_COUNT): Promise<Market[]> {
    try {
      const response = await this.gammaApi.get<Market[]>('/markets', {
        params: {
          limit,
          offset: 0,
          active: true,
          closed: false,
          order: 'volume',
          ascending: false,
        },
      });
      
      // Filter out markets ending soon
      const minHoursRemaining = CONFIG.MIN_MARKET_HOURS_REMAINING;
      const now = Date.now();
      
      const validMarkets = response.data.filter(market => {
        if (!market.endDate) return true; // No end date = keep it
        const endTime = new Date(market.endDate).getTime();
        const hoursRemaining = (endTime - now) / (1000 * 60 * 60);
        return hoursRemaining >= minHoursRemaining;
      });
      
      logger.info(`Found ${validMarkets.length} active markets (${response.data.length - validMarkets.length} filtered out - ending soon)`);
      return validMarkets;
    } catch (error) {
      logAxiosError('Error fetching top active markets', error);
      return [];
    }
  }

  /**
   * Get trades for specific markets (batch query)
   * Useful for monitoring whale activity on specific active markets
   */
  async getTradesForMarkets(
    marketIds: string[],
    minAmount: number = CONFIG.WHALE_THRESHOLD_USD,
    maxAgeHours: number = CONFIG.TRADE_MAX_AGE_HOURS
  ): Promise<Trade[]> {
    if (marketIds.length === 0) return [];
    
    const allTrades: Trade[] = [];
    
    // Process in batches of 10 to avoid URL length limits
    const batchSize = 10;
    for (let i = 0; i < marketIds.length; i += batchSize) {
      const batch = marketIds.slice(i, i + batchSize);
      
      try {
        // The API supports comma-separated market IDs
        const response = await this.dataApi.get<Trade[]>('/trades', {
          params: {
            market: batch.join(','),
            filterType: 'CASH',
            filterAmount: minAmount,
            limit: 100,
            offset: 0,
            takerOnly: true,
          },
        });
        
        allTrades.push(...response.data);
      } catch (error) {
        logAxiosError(`Error fetching trades for market batch ${i / batchSize + 1}`, error);
      }
    }
    
    // Post-fetch time filtering
    // NOTE: API returns timestamp in SECONDS, so we convert to milliseconds
    const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    const recentTrades = allTrades.filter(trade => {
      const tradeTimeMs = trade.timestamp * 1000;
      return tradeTimeMs >= cutoffTime;
    });
    
    logger.info(`Fetched ${allTrades.length} total trades, ${recentTrades.length} within last ${maxAgeHours}h across ${marketIds.length} markets`);
    return recentTrades;
  }

  /**
   * Batch validate market statuses
   * Returns a map of conditionId -> isValid for quick lookups
   */
  async batchValidateMarkets(conditionIds: string[]): Promise<Map<string, boolean>> {
    const validationMap = new Map<string, boolean>();
    
    // Process in batches to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < conditionIds.length; i += batchSize) {
      const batch = conditionIds.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (conditionId) => {
        try {
          const market = await this.getMarketByConditionId(conditionId, 'debug');
          
          if (!market) {
            validationMap.set(conditionId, false);
            return;
          }
          
          // Check all validity conditions
          const isValid = 
            market.active && 
            !market.closed && 
            !market.resolved &&
            this.hasEnoughTimeRemaining(market.endDate);
          
          validationMap.set(conditionId, isValid);
        } catch {
          validationMap.set(conditionId, false);
        }
      }));
    }
    
    return validationMap;
  }

  /**
   * Batch validate markets by SLUG for a specific strategy
   * This is more reliable than using conditionId since Gamma API supports slug queries
   * Returns map of slug -> { isValid, hoursRemaining, reason }
   */
  async batchValidateMarketsBySlug(
    slugs: string[],
    minHours: number,
    maxHours: number
  ): Promise<Map<string, { isValid: boolean; hoursRemaining: number; reason?: string }>> {
    const validationMap = new Map<string, { isValid: boolean; hoursRemaining: number; reason?: string }>();
    
    // Process in batches to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < slugs.length; i += batchSize) {
      const batch = slugs.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (slug) => {
        try {
          const market = await this.getMarketBySlug(slug, 'debug');
          
          if (!market) {
            validationMap.set(slug, { isValid: false, hoursRemaining: 0, reason: 'Market not found' });
            return;
          }
          
          const result = this.validateMarketForStrategy(market, minHours, maxHours);
          validationMap.set(slug, result);
        } catch {
          validationMap.set(slug, { isValid: false, hoursRemaining: 0, reason: 'Validation error' });
        }
      }));
    }
    
    return validationMap;
  }


  /**
   * Check if a market has enough time remaining before end date
   */
  private hasEnoughTimeRemaining(endDate?: string): boolean {
    if (!endDate) return true;
    
    const endTime = new Date(endDate).getTime();
    const now = Date.now();
    const hoursRemaining = (endTime - now) / (1000 * 60 * 60);
    
    return hoursRemaining >= CONFIG.MIN_MARKET_HOURS_REMAINING;
  }

  /**
   * Validate a market for a specific strategy (short-term or long-term)
   * Returns hours remaining and validity based on min/max hours
   */
  validateMarketForStrategy(
    market: Market,
    minHours: number,
    maxHours: number
  ): { isValid: boolean; hoursRemaining: number; reason?: string } {
    // Basic validity checks
    if (!market.active) {
      return { isValid: false, hoursRemaining: 0, reason: 'Market not active' };
    }
    if (market.closed) {
      return { isValid: false, hoursRemaining: 0, reason: 'Market closed' };
    }
    if (market.resolved) {
      return { isValid: false, hoursRemaining: 0, reason: 'Market resolved' };
    }

    // Calculate time remaining
    let hoursRemaining = Infinity;
    if (market.endDate) {
      const endTime = new Date(market.endDate).getTime();
      const now = Date.now();
      hoursRemaining = (endTime - now) / (1000 * 60 * 60);
    }

    // Check time constraints
    if (hoursRemaining < minHours) {
      return { isValid: false, hoursRemaining, reason: `Ends too soon (${hoursRemaining.toFixed(1)}h < ${minHours}h min)` };
    }
    if (hoursRemaining > maxHours) {
      return { isValid: false, hoursRemaining, reason: `Too far out (${hoursRemaining.toFixed(1)}h > ${maxHours}h max)` };
    }

    return { isValid: true, hoursRemaining };
  }

  /**
   * Batch validate markets for a specific strategy
   * Returns map of conditionId -> { isValid, hoursRemaining, strategy }
   */
  async batchValidateMarketsForStrategy(
    conditionIds: string[],
    minHours: number,
    maxHours: number
  ): Promise<Map<string, { isValid: boolean; hoursRemaining: number; reason?: string }>> {
    const validationMap = new Map<string, { isValid: boolean; hoursRemaining: number; reason?: string }>();
    
    // Process in batches to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < conditionIds.length; i += batchSize) {
      const batch = conditionIds.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (conditionId) => {
        try {
          const market = await this.getMarketByConditionId(conditionId, 'debug');
          
          if (!market) {
            validationMap.set(conditionId, { isValid: false, hoursRemaining: 0, reason: 'Market not found' });
            return;
          }
          
          const result = this.validateMarketForStrategy(market, minHours, maxHours);
          validationMap.set(conditionId, result);
        } catch {
          validationMap.set(conditionId, { isValid: false, hoursRemaining: 0, reason: 'Validation error' });
        }
      }));
    }
    
    return validationMap;
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
   * Get market details by slug (most reliable lookup method)
   * The Trade object includes slug, so this is the preferred method for trade validation
   */
  async getMarketBySlug(slug: string, logLevel?: string): Promise<Market | null> {
    try {
      const response = await this.gammaApi.get<Market[]>('/markets', {
        params: {
          slug,
          limit: 1,
        },
      });
      
      if (response.data && response.data.length > 0) {
        return response.data[0];
      }
      return null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 422) {
        const level = logLevel || CONFIG.ERROR_LOG_LEVEL_422;
        const message = `Market slug ${slug} unavailable`;
        switch(level) {
          case 'error': logger.error(message); break;
          case 'warn': logger.warn(message); break;
          case 'info': logger.info(message); break;
          case 'debug': logger.debug(message); break;
        }
        return null;
      }
      logAxiosError(`Error fetching market by slug ${slug}`, error);
      return null;
    }
  }

  /**
   * Get market details by condition ID
   * Uses cached slug mapping first (fast), falls back to active market search (slow)
   */
  async getMarketByConditionId(conditionId: string, logLevel?: string): Promise<Market | null> {
    try {
      // First, try to use cached slug mapping (fast path)
      const cachedSlug = this.conditionIdToSlugCache.get(conditionId);
      if (cachedSlug) {
        const market = await this.getMarketBySlug(cachedSlug, logLevel);
        if (market) {
          return market;
        }
      }
      
      // Fall back to searching active markets (slow path)
      const response = await this.gammaApi.get<Market[]>('/markets', {
        params: {
          limit: 200,
          active: true,
        },
      });
      
      // Find the market with matching conditionId
      const market = response.data.find(m => m.conditionId === conditionId);
      if (market) {
        // Cache the mapping for future lookups
        this.conditionIdToSlugCache.set(conditionId, market.slug);
        return market;
      }
      
      // If not found in active markets, it might be closed - log at debug level to reduce noise
      logger.debug(`Market ${conditionId.slice(0, 20)}... not found in active markets (likely resolved/closed)`);
      return null;
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
