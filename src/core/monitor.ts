import { walletScanner } from '../services/walletScanner.js';
import { walletAnalyzer } from '../services/walletAnalyzer.js';
import { betRater } from '../services/betRater.js';
import { tradeEngine } from '../services/tradeEngine.js';
import { alertSystem } from './alertSystem.js';
import { performanceTracker } from './performanceTracker.js';
import { logger } from '../utils/logger.js';
import { CONFIG } from '../config/settings.js';
import { sleep } from '../utils/helpers.js';
import { getAllWatchedWallets } from '../models/wallet.js';
import { getRecentWalletTrades } from '../models/trade.js';
import { 
  displayHeader, 
  displayWatchedWallets, 
  displayRecentSignals, 
  displayPortfolio,
  displayInfo,
} from '../utils/display.js';

/**
 * Main Monitoring Loop
 * Orchestrates all bot operations
 */
export class Monitor {
  private running = false;
  private startTime: Date = new Date();
  private recentSignals: any[] = [];

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
      displayInfo('Seeding initial whales from leaderboard...');
      await walletScanner.seedFromLeaderboard();
    } catch (error) {
      logger.error('Failed to seed leaderboard:', error);
    }

    // Start main loop
    this.mainLoop();

    // Start display loop
    this.displayLoop();

    // Start daily metrics updater
    this.metricsLoop();
  }

  /**
   * Stop the monitoring loop
   */
  stop(): void {
    this.running = false;
    logger.info('Stopping monitor...');
  }

  /**
   * Main monitoring loop
   */
  private async mainLoop(): Promise<void> {
    while (this.running) {
      try {
        // Scan for whale trades
        const detectedWallets = await walletScanner.scanForWhales();

        // Analyze each detected wallet
        for (const detected of detectedWallets) {
          try {
            // Calculate suspicion score
            const score = await walletAnalyzer.analyzeWallet(detected);

            // Send whale alert
            await alertSystem.sendWhaleAlert(detected, score.totalScore);

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
            await alertSystem.sendErrorAlert(error as Error);
          }
        }

        // Clear old seen trades periodically
        walletScanner.clearOldSeenTrades();

        // Wait before next scan
        await sleep(CONFIG.TRADE_POLL_INTERVAL_MS);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error in main loop: ${errorMessage}`);
        await alertSystem.sendErrorAlert(error as Error);
        await sleep(10000); // Wait 10s before retrying
      }
    }
  }

  /**
   * Display update loop
   */
  private async displayLoop(): Promise<void> {
    while (this.running) {
      try {
        this.updateDisplay();
        await sleep(5000); // Update display every 5 seconds
      } catch (error) {
        logger.error('Error updating display:', error);
      }
    }
  }

  /**
   * Update terminal display
   */
  private updateDisplay(): void {
    const uptime = this.getUptime();
    const wallets = getAllWatchedWallets();
    const portfolio = tradeEngine.getPortfolioStatus();

    displayHeader(uptime);
    displayWatchedWallets(wallets);
    displayRecentSignals(this.recentSignals);
    displayPortfolio(portfolio);
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
