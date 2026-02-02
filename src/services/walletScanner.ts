import { polymarketApi } from './polymarket/api.js';
import { Trade } from './polymarket/types.js';
import { upsertWallet, getWallet } from '../models/wallet.js';
import { insertWalletTrade } from '../models/trade.js';
import { CONFIG } from '../config/settings.js';
import { logger } from '../utils/logger.js';
import { walletAgeInHours, generateId } from '../utils/helpers.js';

export interface DetectedWallet {
  address: string;
  isWhale: boolean;
  isNewSuspicious: boolean;
  trade: Trade;
  walletAge?: number; // in hours
  createdAt?: string;
  strategy?: 'short-term' | 'long-term';  // Which strategy detected this
  marketHoursRemaining?: number;           // Hours until market ends
}

interface StrategyResult {
  trades: Trade[];
  strategy: 'short-term' | 'long-term';
  minHours: number;
  maxHours: number;
  minTradeUsd: number;
}

/**
 * Wallet Scanner Service
 * Scans for whale trades and suspicious new wallets
 * Uses DUAL STRATEGY: short-term (sports/daily) and long-term (politics/crypto) markets
 */
export class WalletScanner {
  private lastScanTime: number = 0;
  private seenTrades: Set<string> = new Set();
  private marketInfoCache: Map<string, { hoursRemaining: number; isValid: boolean; timestamp: number }> = new Map();
  private readonly MARKET_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Scan for large trades using dual strategy approach
   * SHORT-TERM: Sports, esports, daily events (1-48h to resolution)
   * LONG-TERM: Politics, crypto, world events (48h+ to resolution)
   */
  async scanForWhales(): Promise<DetectedWallet[]> {
    const detectedWallets: DetectedWallet[] = [];
    
    logger.info('Scanning for whale trades (dual strategy mode)...');

    // Collect trades from both strategies
    const strategyResults: StrategyResult[] = [];

    // SHORT-TERM STRATEGY
    if (CONFIG.SHORT_TERM_ENABLED) {
      logger.info(`[Short-Term] Looking for $${CONFIG.SHORT_TERM_MIN_TRADE_USD}+ trades in last ${CONFIG.SHORT_TERM_LOOKBACK_HOURS}h on markets ending in ${CONFIG.SHORT_TERM_MIN_HOURS}-${CONFIG.SHORT_TERM_MAX_HOURS}h`);
      
      const shortTermTrades = await polymarketApi.getRecentLargeTrades(
        CONFIG.SHORT_TERM_MIN_TRADE_USD,
        CONFIG.SHORT_TERM_LOOKBACK_HOURS,
        100
      );
      
      strategyResults.push({
        trades: shortTermTrades,
        strategy: 'short-term',
        minHours: CONFIG.SHORT_TERM_MIN_HOURS,
        maxHours: CONFIG.SHORT_TERM_MAX_HOURS,
        minTradeUsd: CONFIG.SHORT_TERM_MIN_TRADE_USD,
      });
      
      logger.info(`[Short-Term] Found ${shortTermTrades.length} trades to evaluate`);
    }

    // LONG-TERM STRATEGY - Fetch all recent trades and filter to long-term markets
    // NOTE: We fetch trades globally (not just from top markets) because whale trades
    // can happen on any market, including lower-volume long-term markets.
    if (CONFIG.LONG_TERM_ENABLED) {
      logger.info(`[Long-Term] Looking for $${CONFIG.LONG_TERM_MIN_TRADE_USD}+ trades in last ${CONFIG.LONG_TERM_LOOKBACK_HOURS}h on markets ending in ${CONFIG.LONG_TERM_MIN_HOURS}-${CONFIG.LONG_TERM_MAX_HOURS}h`);
      
      // Fetch recent large trades globally - same approach as short-term
      // The market validation will filter to only long-term markets
      const longTermTrades = await polymarketApi.getRecentLargeTrades(
        CONFIG.LONG_TERM_MIN_TRADE_USD,
        CONFIG.LONG_TERM_LOOKBACK_HOURS,
        200  // Fetch more trades since we're filtering by time window
      );
      
      strategyResults.push({
        trades: longTermTrades,
        strategy: 'long-term',
        minHours: CONFIG.LONG_TERM_MIN_HOURS,
        maxHours: CONFIG.LONG_TERM_MAX_HOURS,
        minTradeUsd: CONFIG.LONG_TERM_MIN_TRADE_USD,
      });
      
      logger.info(`[Long-Term] Found ${longTermTrades.length} trades to evaluate`);
    }

    // Process each strategy
    for (const result of strategyResults) {
      const { trades, strategy, minHours, maxHours, minTradeUsd } = result;
      
      if (trades.length === 0) continue;

      // Deduplicate trades
      const uniqueTrades = this.deduplicateTrades(trades);
      
      // Cache conditionId -> slug mappings for all trades (enables fast lookups in other services)
      for (const trade of uniqueTrades) {
        polymarketApi.cacheConditionIdSlug(trade.conditionId, trade.slug);
      }
      
      // Get unique slugs from trades (slug is more reliable for API lookups than conditionId)
      const uniqueSlugs = [...new Set(uniqueTrades.map(t => t.slug))];
      
      // Validate markets for this strategy's time window using slugs
      const marketValidation = await this.batchValidateMarketsBySlug(
        uniqueSlugs,
        minHours,
        maxHours
      );
      
      // Filter trades to valid markets
      let validCount = 0;
      let invalidCount = 0;
      
      for (const trade of uniqueTrades) {
        const validation = marketValidation.get(trade.slug);
        
        if (!validation?.isValid) {
          invalidCount++;
          logger.debug(`[${strategy}] Skipping: ${trade.title.slice(0, 40)}... - ${validation?.reason || 'unknown'}`);
          continue;
        }
        
        validCount++;
        
        // Check if trade meets minimum size for this strategy
        const tradeValue = trade.size * trade.price;
        if (tradeValue < minTradeUsd) continue;
        
        // Skip if we've already processed this trade
        const tradeKey = `${trade.proxyWallet}-${trade.transactionHash}`;
        if (this.seenTrades.has(tradeKey)) continue;
        this.seenTrades.add(tradeKey);

        // Process the trade
        const detected = await this.processTradeForDetection(trade);
        if (detected) {
          detected.strategy = strategy;
          detected.marketHoursRemaining = validation.hoursRemaining;
          detectedWallets.push(detected);
        }
      }
      
      logger.info(`[${strategy}] ${validCount} valid, ${invalidCount} filtered out`);
    }

    this.lastScanTime = Date.now();
    
    const shortTermCount = detectedWallets.filter(d => d.strategy === 'short-term').length;
    const longTermCount = detectedWallets.filter(d => d.strategy === 'long-term').length;
    
    logger.info(`Scan complete. Found ${detectedWallets.length} wallets (${shortTermCount} short-term, ${longTermCount} long-term)`);

    return detectedWallets;
  }

  /**
   * Batch validate markets by slug for a specific strategy's time window
   * Uses slugs instead of conditionIds for more reliable API lookups
   */
  private async batchValidateMarketsBySlug(
    slugs: string[],
    minHours: number,
    maxHours: number
  ): Promise<Map<string, { isValid: boolean; hoursRemaining: number; reason?: string }>> {
    const result = new Map<string, { isValid: boolean; hoursRemaining: number; reason?: string }>();
    const toValidate: string[] = [];
    const now = Date.now();

    // Check cache first (keyed by slug now)
    for (const slug of slugs) {
      const cached = this.marketInfoCache.get(slug);
      if (cached && (now - cached.timestamp) < this.MARKET_CACHE_TTL_MS) {
        // Re-check time constraints with cached hoursRemaining
        const hoursRemaining = cached.hoursRemaining - ((now - cached.timestamp) / (1000 * 60 * 60));
        const isValid = cached.isValid && hoursRemaining >= minHours && hoursRemaining <= maxHours;
        result.set(slug, { 
          isValid, 
          hoursRemaining, 
          reason: !isValid ? `Time: ${hoursRemaining.toFixed(1)}h not in ${minHours}-${maxHours}h range` : undefined 
        });
      } else {
        toValidate.push(slug);
      }
    }

    // Validate uncached markets using the API's slug-based method
    if (toValidate.length > 0) {
      const validated = await polymarketApi.batchValidateMarketsBySlug(toValidate, minHours, maxHours);
      
      for (const [slug, validation] of validated) {
        result.set(slug, validation);
        this.marketInfoCache.set(slug, { 
          hoursRemaining: validation.hoursRemaining, 
          isValid: validation.isValid && !validation.reason?.includes('Time:'),  // Base validity without time
          timestamp: now 
        });
      }
      
      // Also cache conditionId -> slug mappings for faster lookups in other services
      // We need to fetch the market details to get the conditionId
      for (const slug of toValidate) {
        const market = await polymarketApi.getMarketBySlug(slug);
        if (market) {
          polymarketApi.cacheConditionIdSlug(market.conditionId, market.slug);
        }
      }
    }

    return result;
  }

  /**
   * Deduplicate trades by transaction hash
   */
  private deduplicateTrades(trades: Trade[]): Trade[] {
    const seen = new Set<string>();
    return trades.filter(trade => {
      const key = trade.transactionHash;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Process a trade to detect whale/suspicious wallet characteristics
   * Shared logic between scanForWhales and processSingleTrade
   */
  private async processTradeForDetection(trade: Trade): Promise<DetectedWallet | null> {
    // Check if this wallet is already known
    let wallet = getWallet(trade.proxyWallet);
    
    // Determine wallet characteristics
    const isWhale = trade.size * trade.price >= CONFIG.WHALE_THRESHOLD_USD;
    let isNewSuspicious = false;
    let walletAge: number | undefined;
    let createdAt: string | undefined;

    // If wallet is known, use cached data
    if (wallet) {
      isNewSuspicious = wallet.is_new_suspicious;
      createdAt = wallet.wallet_created_at || undefined;
      if (createdAt) {
        walletAge = walletAgeInHours(createdAt);
      }
    } else {
      // New wallet - fetch profile info
      const profile = await polymarketApi.getPublicProfile(trade.proxyWallet);

      if (profile?.createdAt) {
        createdAt = profile.createdAt;
        walletAge = walletAgeInHours(profile.createdAt);
        
        // Check if wallet is newly created with large bet
        if (walletAge <= CONFIG.NEW_WALLET_HOURS) {
          isNewSuspicious = true;
        }
      } else {
        // No profile data - check if this is their first trade on record
        const activity = await polymarketApi.getUserActivity(trade.proxyWallet, 10);
        if (activity.length <= 3) {
          // Very few trades, likely new
          isNewSuspicious = true;
          walletAge = 1; // Assume very new
        }
      }
    }

    // Process all whale trades (both known and new wallets)
    if (isWhale || isNewSuspicious) {
      // First, ensure wallet exists in database before adding trades
      upsertWallet({
        address: trade.proxyWallet,
        wallet_created_at: createdAt,
        is_whale: isWhale,
        is_new_suspicious: isNewSuspicious,
        total_volume: trade.size * trade.price,
        suspicion_score: wallet?.suspicion_score || 50,
      });

      logger.info(`Detected trade from ${wallet ? 'known' : 'new'} wallet: ${trade.proxyWallet} | Whale: ${isWhale} | New: ${isNewSuspicious} | Size: $${(trade.size * trade.price).toFixed(2)} | Market: ${trade.title.slice(0, 50)}...`);
      
      // Store wallet trade
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

  /**
   * Seed initial whales from leaderboard
   */
  async seedFromLeaderboard(): Promise<void> {
    logger.info('Seeding whale wallets from leaderboard...');

    const leaderboard = await polymarketApi.getLeaderboard('OVERALL', 'WEEK', 'VOL', 50);

    for (const entry of leaderboard) {
      const existingWallet = getWallet(entry.proxyWallet);
      if (existingWallet) continue; // Already tracked

      // Get profile for creation date
      const profile = await polymarketApi.getPublicProfile(entry.proxyWallet);

      upsertWallet({
        address: entry.proxyWallet,
        wallet_created_at: profile?.createdAt || undefined,
        is_whale: true,
        is_new_suspicious: false,
        total_volume: entry.vol,
        suspicion_score: 50, // Will be calculated properly by analyzer
      });

      logger.info(`Added leaderboard whale: ${entry.proxyWallet} | Vol: $${entry.vol.toFixed(2)}`);
    }

    logger.info(`Seeded ${leaderboard.length} whales from leaderboard`);
  }

  /**
   * Clear old seen trades to prevent memory bloat
   */
  clearOldSeenTrades(): void {
    if (this.seenTrades.size > 10000) {
      this.seenTrades.clear();
      logger.info('Cleared seen trades cache');
    }
  }

  /**
   * Process a single trade (used by WebSocket integration)
   * Returns DetectedWallet if trade is of interest, null otherwise
   */
  async processSingleTrade(trade: Trade): Promise<DetectedWallet | null> {
    // Cache conditionId -> slug mapping for faster lookups
    polymarketApi.cacheConditionIdSlug(trade.conditionId, trade.slug);
    
    // Skip if we've already processed this trade
    const tradeKey = `${trade.proxyWallet}-${trade.transactionHash}`;
    if (this.seenTrades.has(tradeKey)) {
      return null;
    }
    
    this.seenTrades.add(tradeKey);

    // Validate market first - use short-term constraints for WebSocket (real-time) trades
    // Use slug for more reliable API lookups
    const validation = await this.batchValidateMarketsBySlug(
      [trade.slug],
      CONFIG.SHORT_TERM_MIN_HOURS,
      CONFIG.SHORT_TERM_MAX_HOURS
    );
    
    if (!validation.get(trade.slug)?.isValid) {
      logger.debug(`Skipping trade on invalid/closed market: ${trade.title}`);
      return null;
    }

    // Use shared processing logic
    return await this.processTradeForDetection(trade);
  }

  /**
   * Clear the market validation cache
   */
  clearMarketCache(): void {
    this.marketInfoCache.clear();
    logger.debug('Cleared market validation cache');
  }
}

export const walletScanner = new WalletScanner();
