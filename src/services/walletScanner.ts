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
}

/**
 * Wallet Scanner Service
 * Scans for whale trades and suspicious new wallets
 */
export class WalletScanner {
  private lastScanTime: number = 0;
  private seenTrades: Set<string> = new Set();

  /**
   * Scan for large trades and detect whales/suspicious wallets
   */
  async scanForWhales(): Promise<DetectedWallet[]> {
    logger.info('Scanning for whale trades...');

    const trades = await polymarketApi.getLargeTrades(CONFIG.WHALE_THRESHOLD_USD, 100);
    const detectedWallets: DetectedWallet[] = [];

    for (const trade of trades) {
      // Skip if we've already processed this trade
      const tradeKey = `${trade.proxyWallet}-${trade.transactionHash}`;
      if (this.seenTrades.has(tradeKey)) continue;
      
      this.seenTrades.add(tradeKey);

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
          suspicion_score: wallet?.suspicion_score || 50, // Keep existing score or default to 50
        });

        detectedWallets.push({
          address: trade.proxyWallet,
          isWhale,
          isNewSuspicious,
          trade,
          walletAge,
          createdAt,
        });

        logger.info(`Detected trade from ${wallet ? 'known' : 'new'} wallet: ${trade.proxyWallet} | Whale: ${isWhale} | New: ${isNewSuspicious} | Size: $${(trade.size * trade.price).toFixed(2)}`);
        
        // Now store wallet trade (wallet exists now, so FK constraint will pass)
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

    this.lastScanTime = Date.now();
    logger.info(`Scan complete. Found ${detectedWallets.length} new wallets of interest.`);

    return detectedWallets;
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
    // Skip if we've already processed this trade
    const tradeKey = `${trade.proxyWallet}-${trade.transactionHash}`;
    if (this.seenTrades.has(tradeKey)) {
      return null;
    }
    
    this.seenTrades.add(tradeKey);

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

    // Process if whale or suspicious
    if (isWhale || isNewSuspicious) {
      // Ensure wallet exists in database
      upsertWallet({
        address: trade.proxyWallet,
        wallet_created_at: createdAt,
        is_whale: isWhale,
        is_new_suspicious: isNewSuspicious,
        total_volume: trade.size * trade.price,
        suspicion_score: wallet?.suspicion_score || 50,
      });

      logger.info(`Detected trade from ${wallet ? 'known' : 'new'} wallet: ${trade.proxyWallet} | Whale: ${isWhale} | New: ${isNewSuspicious} | Size: $${(trade.size * trade.price).toFixed(2)}`);
      
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
}

export const walletScanner = new WalletScanner();
