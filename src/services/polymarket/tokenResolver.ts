import axios from 'axios';
import { CONFIG } from '../../config/settings.js';
import { logger } from '../../utils/logger.js';

/**
 * Token Resolver - Resolves market condition IDs to outcome token IDs
 * Uses Polymarket's Gamma API to fetch token IDs for trading
 */

interface TokenMapping {
  tokenId: string;
  outcome: string;
  price: number;
}

interface MarketTokens {
  conditionId: string;
  tokens: TokenMapping[];
  cachedAt: number;
}

// Cache token mappings to avoid repeated API calls (24 hour TTL)
const tokenCache = new Map<string, MarketTokens>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Get token IDs for a market
 * @param conditionId Market condition ID
 * @returns Array of token mappings (Yes/No outcomes with token IDs)
 */
export async function getMarketTokens(conditionId: string): Promise<TokenMapping[]> {
  // Check cache first
  const cached = tokenCache.get(conditionId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    logger.debug(`Using cached tokens for market ${conditionId}`);
    return cached.tokens;
  }

  try {
    logger.info(`Fetching token IDs for market ${conditionId}...`);

    // Fetch market data from Gamma API
    const response = await axios.get(`${CONFIG.GAMMA_API}/markets/${conditionId}`, {
      timeout: 10000,
    });

    if (!response.data) {
      throw new Error('No market data returned');
    }

    const market = response.data;

    // Extract token information
    const tokens: TokenMapping[] = [];

    if (market.tokens && Array.isArray(market.tokens)) {
      for (const token of market.tokens) {
        tokens.push({
          tokenId: token.token_id || token.tokenId,
          outcome: token.outcome,
          price: parseFloat(token.price || '0'),
        });
      }
    }

    if (tokens.length === 0) {
      throw new Error('No tokens found for market');
    }

    // Cache the result
    tokenCache.set(conditionId, {
      conditionId,
      tokens,
      cachedAt: Date.now(),
    });

    logger.info(`Found ${tokens.length} tokens for market ${conditionId}`);
    return tokens;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.message;
      const status = error.response?.status;
      logger.error(`Failed to fetch tokens for market ${conditionId}: ${errorMessage} (status: ${status})`);
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to fetch tokens for market ${conditionId}: ${errorMessage}`);
    }
    throw error;
  }
}

/**
 * Get token ID for a specific outcome
 * @param conditionId Market condition ID
 * @param outcome Outcome to resolve (e.g., "Yes", "No")
 * @returns Token ID for the outcome
 */
export async function getTokenIdForOutcome(
  conditionId: string,
  outcome: string
): Promise<string> {
  const tokens = await getMarketTokens(conditionId);

  const normalizedOutcome = outcome.toLowerCase();
  const token = tokens.find((t) => t.outcome.toLowerCase() === normalizedOutcome);

  if (!token) {
    throw new Error(`No token found for outcome "${outcome}" in market ${conditionId}`);
  }

  logger.debug(`Resolved ${outcome} -> ${token.tokenId} for market ${conditionId}`);
  return token.tokenId;
}

/**
 * Get current prices for market outcomes
 * @param conditionId Market condition ID
 * @returns Map of outcome -> current price
 */
export async function getMarketPrices(conditionId: string): Promise<Map<string, number>> {
  const tokens = await getMarketTokens(conditionId);

  const prices = new Map<string, number>();
  for (const token of tokens) {
    prices.set(token.outcome, token.price);
  }

  return prices;
}

/**
 * Clear cache for a specific market or all markets
 * @param conditionId Optional condition ID to clear (clears all if not provided)
 */
export function clearTokenCache(conditionId?: string): void {
  if (conditionId) {
    tokenCache.delete(conditionId);
    logger.debug(`Cleared token cache for market ${conditionId}`);
  } else {
    tokenCache.clear();
    logger.debug('Cleared entire token cache');
  }
}

/**
 * Get cache statistics
 */
export function getTokenCacheStats(): { size: number; entries: string[] } {
  return {
    size: tokenCache.size,
    entries: Array.from(tokenCache.keys()),
  };
}
