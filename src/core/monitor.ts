import { walletScanner } from '../services/walletScanner.js';
import { walletAnalyzer } from '../services/walletAnalyzer.js';
import { betRater } from '../services/betRater.js';
import { tradeEngine } from '../services/tradeEngine.js';
import { alertSystem } from './alertSystem.js';
import { performanceTracker } from './performanceTracker.js';
import { logger } from '../utils/logger.js';
import { CONFIG } from '../config/settings.js';
import { sleep } from '../utils/helpers.js';
import { getAllWatchedWallets, updateWalletRecord } from '../models/wallet.js';
import { getRecentWalletTrades, getUnresolvedTrades, resolveWalletTrade, markTradeAsArchived } from '../models/trade.js';
import { getOpenPaperTrades, resolvePaperTrade, cancelPaperTrade } from '../models/paperTrade.js';
import { polymarketApi } from '../services/polymarket/api.js';
import { polymarketWS } from '../services/polymarket/wsClient.js';
import { WSLastTradePrice, WSMarketResolved } from '../services/polymarket/wsTypes.js';
import { getWebSocketManager } from '../index.js';

/**
 * Main Monitoring Loop
 * Orchestrates all bot operations
 */
export class Monitor {
  private running = false;
  private startTime: Date = new Date();
  private recentSignals: any[] = [];
  private wsTradeQueue: WSLastTradePrice[] = [];
  private processingWSTrades = false;

  /**
   * Start the monitoring loop
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('Monitor is already running');
      return;
    }

    this.running = true;
    this.startTime = new Date();
    
    logger.info('🚀 Starting Polymarket Whale Scout...');

    // Initialize trade engine
    tradeEngine.initialize();

    // Seed initial whales from leaderboard
    try {
      logger.info('Seeding initial whales from leaderboard...');
      await walletScanner.seedFromLeaderboard();
    } catch (error) {
      logger.error('Failed to seed leaderboard:', error);
    }

    // Initialize WebSocket if enabled
    if (CONFIG.USE_WEBSOCKET) {
      await this.initializeWebSocket();
    }

    // Start main loop (REST API polling or WebSocket processing)
    this.mainLoop();

    // Start daily metrics updater
    this.metricsLoop();

    // Start market resolution checker
    this.resolutionCheckLoop();
  }

  /**
   * Stop the monitoring loop
   */
  stop(): void {
    this.running = false;
    
    // Disconnect WebSocket if connected
    if (CONFIG.USE_WEBSOCKET && polymarketWS.isConnected()) {
      polymarketWS.disconnect();
    }
    
    logger.info('Stopping monitor...');
  }

  /**
   * Initialize WebSocket connection and subscribe to top markets
   */
  private async initializeWebSocket(): Promise<void> {
    try {
      logger.info('Initializing WebSocket connection...');
      
      // Fetch top markets to subscribe to
      logger.info('Fetching top markets for WebSocket subscription...');
      const assetIds = await polymarketApi.getTopMarketAssetIds(50);
      
      if (assetIds.length === 0) {
        logger.warn('No asset IDs found for WebSocket subscription. Falling back to REST API polling.');
        return;
      }

      // Connect and subscribe
      await polymarketWS.connect(assetIds);
      
      // Set up event handlers
      this.setupWebSocketHandlers();
      
      logger.info(`WebSocket initialized and subscribed to ${assetIds.length} assets`);
      logger.info(`WebSocket: Monitoring ${assetIds.length} top markets in real-time`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize WebSocket: ${errorMessage}. Falling back to REST API polling.`);
      logger.info('WebSocket failed - using REST API polling');
    }
  }

  /**
   * Set up WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    // Handle trade events
    polymarketWS.on('trade', (trade: WSLastTradePrice) => {
      this.handleWSTradeEvent(trade);
    });

    // Handle market resolution events
    polymarketWS.on('market_resolved', (event: WSMarketResolved) => {
      this.handleWSMarketResolved(event);
    });

    // Handle errors
    polymarketWS.on('error', (error: Error) => {
      logger.error(`WebSocket error: ${error.message}`);
    });

    // Handle disconnection
    polymarketWS.on('disconnected', () => {
      logger.warn('WebSocket disconnected after max reconnection attempts');
      logger.info('WebSocket disconnected - using REST API polling');
    });
  }

  /**
   * Handle WebSocket trade events
   * Queue trades for processing to avoid blocking
   */
  private handleWSTradeEvent(trade: WSLastTradePrice): void {
    const tradeAmount = parseFloat(trade.size) * parseFloat(trade.price);
    
    // Only queue large trades (whale threshold)
    if (tradeAmount >= CONFIG.WHALE_THRESHOLD_USD) {
      this.wsTradeQueue.push(trade);
      logger.debug(`Queued WS trade: $${tradeAmount.toFixed(0)} on market ${trade.market}`);
    }
  }

  /**
   * Handle WebSocket market resolution events
   * Process immediately for faster resolution updates
   */
  private async handleWSMarketResolved(event: WSMarketResolved): Promise<void> {
    try {
      logger.info(`Market resolved via WebSocket: ${event.market} - Winner: ${event.winning_outcome}`);
      
      // Get unresolved trades for this market
      const unresolvedTrades = getUnresolvedTrades().filter(t => t.market_id === event.id);
      const openPaperTrades = getOpenPaperTrades().filter(t => t.market_id === event.id);
      
      let resolvedCount = 0;

      // Resolve wallet trades
      for (const trade of unresolvedTrades) {
        const won = trade.outcome === event.winning_outcome;
        resolveWalletTrade(trade.id, won);
        updateWalletRecord(trade.wallet_address, won);
        logger.info(`Resolved trade for ${trade.wallet_address}: ${won ? 'WON' : 'LOST'}`);
        resolvedCount++;
      }

      // Resolve paper trades
      for (const trade of openPaperTrades) {
        const won = trade.outcome === event.winning_outcome;
        resolvePaperTrade(trade.id, won);
        
        // Update balance
        if (won) {
          tradeEngine.updateBalance(trade.shares - trade.virtual_amount);
        } else {
          tradeEngine.updateBalance(-trade.virtual_amount);
        }

        logger.info(`Resolved paper trade: ${won ? 'WON' : 'LOST'} | P&L: ${won ? '+' : ''}$${(won ? trade.shares - trade.virtual_amount : -trade.virtual_amount).toFixed(2)}`);
        
        // Broadcast trade resolution to WebSocket clients
        try {
          const wsManager = getWebSocketManager();
          if (wsManager) {
            wsManager.sendTradeResolved({
              id: trade.id,
              market: trade.market_title,
              outcome: trade.outcome,
              won,
              pnl: won ? trade.shares - trade.virtual_amount : -trade.virtual_amount,
              timestamp: Date.now(),
            });
          }
        } catch (error) {
          // Silently fail if dashboard is not running
        }
      }

      if (resolvedCount > 0) {
        logger.info(`Market resolved: ${resolvedCount} trades updated`);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error handling WS market resolution: ${errorMessage}`);
    }
  }

  /**
   * Main monitoring loop
   */
  private async mainLoop(): Promise<void> {
    while (this.running) {
      try {
        let detectedWallets: any[] = [];

        // WebSocket mode: Process queued trades
        if (CONFIG.USE_WEBSOCKET && polymarketWS.isConnected()) {
          detectedWallets = await this.processWSTradeQueue();
        } 
        // REST API mode: Poll for large trades
        else {
          detectedWallets = await walletScanner.scanForWhales();
        }

        // Analyze each detected wallet
        for (const detected of detectedWallets) {
          try {
            // Calculate suspicion score
            const score = await walletAnalyzer.analyzeWallet(detected);

            // Send whale alert
            await alertSystem.sendWhaleAlert(detected, score.totalScore);
            
            // Broadcast whale detection to WebSocket clients
            try {
              const wsManager = getWebSocketManager();
              if (wsManager) {
                wsManager.sendWhaleDetected({
                  wallet: detected.address,
                  market: detected.trade.title,
                  outcome: detected.trade.outcome,
                  amount: detected.trade.amount,
                  price: detected.trade.price,
                  score: score.totalScore,
                  timestamp: Date.now(),
                });
              }
            } catch (error) {
              // Silently fail if dashboard is not running
            }

            // Rate the bet
            const rating = await betRater.rateBet(detected.trade, score.totalScore);

            // Record signal
            performanceTracker.recordSignal();

            // Store for display
            this.recentSignals.unshift({
              timestamp: new Date(),
              wallet: detected.address,
              market: detected.trade.title,
              outcome: detected.trade.outcome,
              price: detected.trade.price,
              confidence: rating.finalScore,
              executed: rating.shouldTrade,
            });

            // Keep only recent signals
            if (this.recentSignals.length > 20) {
              this.recentSignals = this.recentSignals.slice(0, 20);
            }

            // Execute paper trade if confidence is high enough
            if (rating.shouldTrade) {
              const result = await tradeEngine.evaluateTrade(rating);
              
              if (result.executed) {
                await alertSystem.sendTradeAlert(rating, result);
              } else {
                logger.info(`Trade not executed: ${result.reason}`);
              }
            }

          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Error processing wallet ${detected.address}: ${errorMessage}`);
            
            // Create safe error object without circular references for alert system
            const safeError = new Error(errorMessage);
            if (error instanceof Error && error.stack) {
              safeError.stack = error.stack;
            }
            await alertSystem.sendErrorAlert(safeError);
          }
        }

        // Clear old seen trades periodically
        walletScanner.clearOldSeenTrades();

        // Wait before next scan (shorter interval in WS mode since we're just checking queue)
        const sleepTime = CONFIG.USE_WEBSOCKET && polymarketWS.isConnected() 
          ? 5000  // 5 seconds in WS mode (just for queue processing)
          : CONFIG.TRADE_POLL_INTERVAL_MS;  // 30 seconds in REST mode
        
        await sleep(sleepTime);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error in main loop: ${errorMessage}`);
        await alertSystem.sendErrorAlert(error as Error);
        await sleep(10000); // Wait 10s before retrying
      }
    }
  }

  /**
   * Process WebSocket trade queue
   * Enriches WS trade data with full market info from REST API
   */
  private async processWSTradeQueue(): Promise<any[]> {
    if (this.processingWSTrades || this.wsTradeQueue.length === 0) {
      return [];
    }

    this.processingWSTrades = true;
    const detectedWallets: any[] = [];

    try {
      // Process up to 10 trades at a time
      const tradesToProcess = this.wsTradeQueue.splice(0, 10);
      
      for (const wsTrade of tradesToProcess) {
        try {
          // Fetch full market data from REST API to enrich WS data
          const market = await polymarketApi.getMarketByConditionId(wsTrade.market);
          
          if (!market) {
            logger.warn(`Could not fetch market data for ${wsTrade.market}`);
            continue;
          }

          // Find the specific token/outcome from the asset_id
          const token = market.tokens?.find(t => t.token_id === wsTrade.asset_id);
          const outcomeIndex = token ? market.tokens?.indexOf(token) : -1;
          const outcome = (outcomeIndex !== undefined && outcomeIndex >= 0) ? market.outcomes[outcomeIndex] : 'Unknown';

          // Create a Trade-like object for compatibility with existing scanner
          const enrichedTrade = {
            id: wsTrade.market,
            title: market.question || market.title || 'Unknown Market',
            outcome: outcome,
            price: parseFloat(wsTrade.price),
            shares: parseFloat(wsTrade.size),
            amount: parseFloat(wsTrade.size) * parseFloat(wsTrade.price),
            timestamp: new Date(wsTrade.timestamp).getTime(),
            side: wsTrade.side,
            asset_id: wsTrade.asset_id,
            market_slug: market.slug || '',
          };

          // Note: WS doesn't provide wallet address, so we can't directly detect specific wallets
          // Instead, we'll scan recent trades for this market via REST API
          const recentTrades = await polymarketApi.getLargeTrades(CONFIG.WHALE_THRESHOLD_USD, 20);
          
          // Find trades matching this market and recent timeframe (within 30 seconds)
          const matchingTrades = recentTrades.filter(t => 
            t.id === wsTrade.market && 
            Math.abs(t.timestamp - enrichedTrade.timestamp) < 30000
          );

          // Process matching trades through normal scanner logic
          for (const trade of matchingTrades) {
            const detected = await walletScanner.processSingleTrade(trade);
            if (detected) {
              detectedWallets.push(detected);
            }
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`Error processing WS trade: ${errorMessage}`);
        }
      }

    } finally {
      this.processingWSTrades = false;
    }

    return detectedWallets;
  }

  /**
   * Metrics update loop
   */
  private async metricsLoop(): Promise<void> {
    while (this.running) {
      try {
        // Update metrics every hour
        performanceTracker.updateDailyMetrics();
        await sleep(3600000); // 1 hour
      } catch (error) {
        logger.error('Error updating metrics:', error);
      }
    }
  }

  /**
   * Market resolution checker loop
   * Checks every 5 minutes if any tracked markets have resolved
   */
  private async resolutionCheckLoop(): Promise<void> {
    // Wait 1 minute before first check
    await sleep(60000);

    while (this.running) {
      try {
        logger.info('Checking for resolved markets...');

        // Get all unresolved wallet trades (already excludes archived)
        const unresolvedTrades = getUnresolvedTrades();
        
        // Get all open paper trades
        const openPaperTrades = getOpenPaperTrades();

        // Filter by age - only check recent trades (within threshold)
        const ageThresholdMs = CONFIG.MARKET_AGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
        const cutoffTime = Date.now() - ageThresholdMs;
        
        const recentWalletTrades = unresolvedTrades.filter(t => {
          const tradeTime = new Date(t.timestamp).getTime();
          return tradeTime >= cutoffTime;
        });
        
        const recentPaperTrades = openPaperTrades.filter(t => {
          const tradeTime = new Date(t.timestamp).getTime();
          return tradeTime >= cutoffTime;
        });

        // Mark old wallet trades as archived (don't archive paper trades - keep history)
        if (CONFIG.MARK_OLD_AS_ARCHIVED) {
          const oldWalletTrades = unresolvedTrades.filter(t => {
            const tradeTime = new Date(t.timestamp).getTime();
            return tradeTime < cutoffTime;
          });
          
          for (const trade of oldWalletTrades) {
            markTradeAsArchived(
              trade.id, 
              `Market older than ${CONFIG.MARKET_AGE_THRESHOLD_DAYS} days`
            );
          }
          
          if (oldWalletTrades.length > 0) {
            logger.info(`Archived ${oldWalletTrades.length} old unresolved wallet trades (>${CONFIG.MARKET_AGE_THRESHOLD_DAYS} days)`);
          }
        }

        // Group by market (only recent trades)
        const marketIds = new Set<string>();
        recentWalletTrades.forEach(t => marketIds.add(t.market_id));
        recentPaperTrades.forEach(t => marketIds.add(t.market_id));

        let resolvedCount = 0;
        let archivedCount = 0;

        for (const marketId of marketIds) {
          try {
            // Fetch market with configurable log level for 422 errors
            const market = await polymarketApi.getMarketByConditionId(
              marketId,
              CONFIG.ERROR_LOG_LEVEL_422
            );
            
            if (!market) {
              // Market unavailable (likely 422 - archived/resolved)
              // Try fallback: check if any wallet has a closed position for this market
              logger.debug(`Market ${marketId} unavailable via /markets, trying /closed-positions fallback...`);
              
              const marketWalletTrades = recentWalletTrades.filter(t => t.market_id === marketId);
              const marketPaperTrades = recentPaperTrades.filter(t => t.market_id === marketId);
              
              // Get unique wallet addresses to query
              const walletAddresses = new Set<string>();
              marketWalletTrades.forEach(t => walletAddresses.add(t.wallet_address));
              marketPaperTrades.forEach(t => walletAddresses.add(t.triggered_by));
              
              let resolutionFound = false;
              let winningOutcome: string | null = null;
              
              // Check closed positions for each wallet
              for (const walletAddr of walletAddresses) {
                const closedPositions = await polymarketApi.getClosedPositions(walletAddr, marketId);
                
                if (closedPositions.length > 0) {
                  // Found a closed position - market is resolved!
                  const closedPos = closedPositions[0];
                  resolutionFound = true;
                  
                  // Determine winning outcome from closed position
                  // If realizedPnl > 0, this outcome won. If < 0, opposite outcome won.
                  if (closedPos.realizedPnl > 0) {
                    winningOutcome = closedPos.outcome;
                  } else {
                    winningOutcome = closedPos.oppositeOutcome;
                  }
                  
                  logger.info(`Found resolution via closed position: ${winningOutcome} won (market: ${closedPos.title})`);
                  break;
                }
              }
              
              if (resolutionFound && winningOutcome) {
                // Resolve all trades for this market using the winning outcome
                for (const trade of marketWalletTrades) {
                  const won = trade.outcome === winningOutcome;
                  resolveWalletTrade(trade.id, won);
                  updateWalletRecord(trade.wallet_address, won);
                  logger.info(`Resolved trade for ${trade.wallet_address}: ${won ? 'WON' : 'LOST'} (via fallback)`);
                  resolvedCount++;
                }
                
                for (const trade of marketPaperTrades) {
                  const won = trade.outcome === winningOutcome;
                  resolvePaperTrade(trade.id, won);
                  
                  if (won) {
                    tradeEngine.updateBalance(trade.shares - trade.virtual_amount);
                  } else {
                    tradeEngine.updateBalance(-trade.virtual_amount);
                  }
                  
                  logger.info(`Resolved paper trade: ${won ? 'WON' : 'LOST'} | P&L: ${won ? '+' : ''}$${(won ? trade.shares - trade.virtual_amount : -trade.virtual_amount).toFixed(2)} (via fallback)`);
                }
              } else {
                // Could not determine outcome via any method
                if (CONFIG.MARK_OLD_AS_ARCHIVED) {
                  // Archive wallet trades
                  for (const trade of marketWalletTrades) {
                    markTradeAsArchived(trade.id, 'Market unavailable - outcome indeterminate');
                    archivedCount++;
                  }
                  
                  if (marketWalletTrades.length > 0) {
                    logger.debug(`Archived ${marketWalletTrades.length} trades for indeterminate market ${marketId}`);
                  }
                  
                  // Cancel paper trades (don't count as wins or losses)
                  for (const trade of marketPaperTrades) {
                    cancelPaperTrade(trade.id, 'Market outcome indeterminate');
                    tradeEngine.updateBalance(trade.virtual_amount); // Return capital
                    logger.info(`Paper trade cancelled (indeterminate outcome): $${trade.virtual_amount.toFixed(2)} returned to balance`);
                  }
                }
              }
              
              continue;
            }

            if (!market.resolved) {
              continue; // Still active
            }

            // Market resolved - process normally
            logger.info(`Market resolved: ${market.title}`);

            // Determine winning outcome
            const winningOutcomeIndex = market.outcomePrices.findIndex((price: string) => parseFloat(price) === 1.0);
            const winningOutcome = winningOutcomeIndex >= 0 ? market.outcomes[winningOutcomeIndex] : null;

            if (!winningOutcome) {
              logger.warn(`Could not determine winning outcome for market: ${marketId}`);
              continue;
            }

            logger.info(`Winning outcome: ${winningOutcome}`);

            // Resolve wallet trades for this market
            const marketTrades = recentWalletTrades.filter(t => t.market_id === marketId);
            for (const trade of marketTrades) {
              const won = trade.outcome === winningOutcome;
              resolveWalletTrade(trade.id, won);
              updateWalletRecord(trade.wallet_address, won);
              
              logger.info(`Resolved trade for ${trade.wallet_address}: ${won ? 'WON' : 'LOST'}`);
              resolvedCount++;
            }

            // Resolve paper trades for this market
            const marketPaperTrades = recentPaperTrades.filter(t => t.market_id === marketId);
            for (const trade of marketPaperTrades) {
              const won = trade.outcome === winningOutcome;
              resolvePaperTrade(trade.id, won);
              
              // Update trade engine balance
              if (won) {
                tradeEngine.updateBalance(trade.shares - trade.virtual_amount);
              } else {
                tradeEngine.updateBalance(-trade.virtual_amount);
              }

              logger.info(`Resolved paper trade: ${won ? 'WON' : 'LOST'} | P&L: ${won ? '+' : ''}$${(won ? trade.shares - trade.virtual_amount : -trade.virtual_amount).toFixed(2)}`);
              
              // Broadcast trade resolution to WebSocket clients
              try {
                const wsManager = getWebSocketManager();
                if (wsManager) {
                  wsManager.sendTradeResolved({
                    id: trade.id,
                    market: trade.market_title,
                    outcome: trade.outcome,
                    won,
                    pnl: won ? trade.shares - trade.virtual_amount : -trade.virtual_amount,
                    timestamp: Date.now(),
                  });
                }
              } catch (error) {
                // Silently fail if dashboard is not running
              }
            }

          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Error checking resolution for market ${marketId}: ${errorMessage}`);
          }

          // Small delay between API calls to avoid rate limits
          await sleep(500);
        }

        if (resolvedCount > 0 || archivedCount > 0) {
          logger.info(
            `Resolution check complete. Resolved: ${resolvedCount}, Archived: ${archivedCount}`
          );
        }

        // Wait before next check
        await sleep(CONFIG.RESOLUTION_CHECK_INTERVAL_MS);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error in resolution check loop: ${errorMessage}`);
        await sleep(60000); // Wait 1 minute before retrying
      }
    }
  }

  /**
   * Get formatted uptime
   */
  private getUptime(): string {
    const now = Date.now();
    const start = this.startTime.getTime();
    const diff = now - start;

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);

    return `${hours}h ${minutes}m`;
  }

  /**
   * Check if monitor is running
   */
  isRunning(): boolean {
    return this.running;
  }
}

export const monitor = new Monitor();
