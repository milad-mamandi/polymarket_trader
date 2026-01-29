import { BetRating } from '../services/betRater.js';
import { telegramService } from '../services/telegram.js';
import { logger } from '../utils/logger.js';
import { displayWhaleAlert, displayTradeExecution, displayError } from '../utils/display.js';
import { DetectedWallet } from '../services/walletScanner.js';
import { timeAgo } from '../utils/helpers.js';
import { tradeEngine } from '../services/tradeEngine.js';
import { getWallet } from '../models/wallet.js';

export interface AlertParams {
  type: 'whale' | 'trade' | 'error';
  data: any;
}

/**
 * Alert System
 * Manages multi-channel notifications
 */
export class AlertSystem {
  private alerts: Array<{ timestamp: Date; type: string; data: any }> = [];
  private maxAlerts = 100;

  /**
   * Send a whale detection alert
   */
  async sendWhaleAlert(detected: DetectedWallet, score: number): Promise<void> {
    const alertData = {
      wallet: detected.address,
      walletType: this.getWalletType(detected),
      walletAge: detected.walletAge ? `${detected.walletAge.toFixed(1)}h old` : 'Unknown',
      suspicionScore: score,
      market: detected.trade.title,
      side: detected.trade.side,
      outcome: detected.trade.outcome,
      price: detected.trade.price,
      size: detected.trade.size * detected.trade.price,
    };

    // Store alert
    this.addAlert('whale', alertData);

    // Console display
    displayWhaleAlert({
      wallet: alertData.wallet,
      walletType: alertData.walletType,
      score: alertData.suspicionScore,
      market: alertData.market,
      outcome: alertData.outcome,
      price: alertData.price,
      size: alertData.size,
    });

    // Telegram notification
    await telegramService.sendWhaleAlert(alertData);

    logger.info(`Whale alert sent for ${detected.address}`);
  }

  /**
   * Send a trade execution alert
   */
  async sendTradeAlert(rating: BetRating, tradeResult: any): Promise<void> {
    const portfolio = tradeEngine.getPortfolioStatus();
    
    const alertData = {
      wallet: rating.walletAddress,
      walletType: this.getWalletTypeFromAddress(rating.walletAddress),
      market: rating.trade.title,
      outcome: rating.trade.outcome,
      price: rating.trade.price,
      confidence: rating.finalScore,
      amount: tradeResult.amount,
      shares: tradeResult.shares,
      portfolioValue: portfolio.totalValue,
      pnlPercent: portfolio.pnlPercent,
    };

    // Store alert
    this.addAlert('trade', alertData);

    // Console display
    displayTradeExecution(alertData);

    // Telegram notification
    await telegramService.sendTradeAlert(alertData);

    logger.info(`Trade alert sent for ${rating.walletAddress}`);
  }

  /**
   * Send an error alert
   */
  async sendErrorAlert(error: Error | string): Promise<void> {
    const errorMsg = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Store alert
    this.addAlert('error', { message: errorMsg });

    // Console display
    displayError(errorMsg);

    // Telegram notification
    await telegramService.sendError(errorMsg);

    // Log only the message and stack, not the entire error object
    if (errorStack) {
      logger.error(`Error alert sent: ${errorMsg}`, { stack: errorStack });
    } else {
      logger.error(`Error alert sent: ${errorMsg}`);
    }
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit = 20): Array<{ timestamp: Date; type: string; data: any }> {
    return this.alerts.slice(-limit).reverse();
  }

  /**
   * Add alert to history
   */
  private addAlert(type: string, data: any): void {
    this.alerts.push({
      timestamp: new Date(),
      type,
      data,
    });

    // Keep only recent alerts
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }
  }

  /**
   * Get wallet type string
   */
  private getWalletType(detected: DetectedWallet): string {
    const types: string[] = [];
    if (detected.isWhale) types.push('WHALE');
    if (detected.isNewSuspicious) types.push('NEW');
    return types.join('+') || 'TRACKED';
  }

  /**
   * Get wallet type from address
   */
  private getWalletTypeFromAddress(address: string): string {
    const wallet = getWallet(address);
    
    if (!wallet) return 'UNKNOWN';
    
    const types: string[] = [];
    if (wallet.is_whale) types.push('WHALE');
    if (wallet.is_new_suspicious) types.push('NEW');
    return types.join('+') || 'TRACKED';
  }
}

export const alertSystem = new AlertSystem();
