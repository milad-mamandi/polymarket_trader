import { Telegraf } from 'telegraf';
import { CONFIG } from '../config/settings.js';
import { logger } from '../utils/logger.js';
import { BetRating } from './betRater.js';
import { truncateAddress, formatUSD, formatPercent } from '../utils/helpers.js';

/**
 * Telegram Notification Service
 */
export class TelegramService {
  private bot: Telegraf | null = null;
  private enabled: boolean = false;

  constructor() {
    if (CONFIG.TELEGRAM_ENABLED && CONFIG.TELEGRAM_BOT_TOKEN) {
      try {
        this.bot = new Telegraf(CONFIG.TELEGRAM_BOT_TOKEN);
        this.enabled = true;
        logger.info('Telegram bot initialized');
      } catch (error) {
        logger.error('Failed to initialize Telegram bot:', error);
        this.enabled = false;
      }
    } else {
      logger.info('Telegram notifications disabled (no token provided)');
    }
  }

  /**
   * Send whale alert message
   */
  async sendWhaleAlert(params: {
    wallet: string;
    walletType: string;
    walletAge: string;
    suspicionScore: number;
    market: string;
    side: string;
    outcome: string;
    price: number;
    size: number;
  }): Promise<void> {
    if (!this.enabled || !this.bot || !CONFIG.TELEGRAM_CHAT_ID) return;

    const message = `
🐋 *WHALE ALERT*

*Wallet:* \`${truncateAddress(params.wallet)}\`
*Type:* ${params.walletType} (${params.walletAge})
*Suspicion Score:* ${params.suspicionScore}/100

📊 *Market:* ${this.escapeMarkdown(params.market)}
*Side:* ${params.outcome} @ $${params.price.toFixed(4)}
*Size:* ${formatUSD(params.size)}
    `.trim();

    try {
      await this.bot.telegram.sendMessage(CONFIG.TELEGRAM_CHAT_ID, message, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      logger.error('Failed to send Telegram whale alert:', error);
    }
  }

  /**
   * Send paper trade execution alert
   */
  async sendTradeAlert(params: {
    wallet: string;
    walletType: string;
    market: string;
    outcome: string;
    price: number;
    confidence: number;
    amount: number;
    shares: number;
    portfolioValue: number;
    pnlPercent: number;
  }): Promise<void> {
    if (!this.enabled || !this.bot || !CONFIG.TELEGRAM_CHAT_ID) return;

    const pnlEmoji = params.pnlPercent >= 0 ? '📈' : '📉';
    const pnlSign = params.pnlPercent >= 0 ? '+' : '';

    const message = `
✅ *PAPER TRADE EXECUTED*

*Triggered by:* \`${truncateAddress(params.wallet)}\`
*Type:* ${params.walletType}

📊 *Market:* ${this.escapeMarkdown(params.market)}
*Side:* ${params.outcome} @ $${params.price.toFixed(4)}
*Amount:* ${formatUSD(params.amount)}
*Shares:* ${params.shares.toFixed(2)}

🎯 *Confidence:* ${params.confidence}%

${pnlEmoji} *Portfolio:* ${formatUSD(params.portfolioValue)} (${pnlSign}${params.pnlPercent.toFixed(2)}%)
    `.trim();

    try {
      await this.bot.telegram.sendMessage(CONFIG.TELEGRAM_CHAT_ID, message, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      logger.error('Failed to send Telegram trade alert:', error);
    }
  }

  /**
   * Send daily summary
   */
  async sendDailySummary(params: {
    watchedWallets: number;
    signalsGenerated: number;
    tradesExecuted: number;
    portfolioValue: number;
    pnl: number;
    winRate: number;
  }): Promise<void> {
    if (!this.enabled || !this.bot || !CONFIG.TELEGRAM_CHAT_ID) return;

    const pnlEmoji = params.pnl >= 0 ? '📈' : '📉';
    const pnlSign = params.pnl >= 0 ? '+' : '';

    const message = `
📊 *DAILY SUMMARY*

*Watched Wallets:* ${params.watchedWallets}
*Signals Generated:* ${params.signalsGenerated}
*Trades Executed:* ${params.tradesExecuted}

${pnlEmoji} *Portfolio:* ${formatUSD(params.portfolioValue)}
*P&L:* ${pnlSign}${formatUSD(params.pnl)} (${formatPercent(params.pnl / CONFIG.INITIAL_PAPER_BALANCE)})
*Win Rate:* ${formatPercent(params.winRate)}
    `.trim();

    try {
      await this.bot.telegram.sendMessage(CONFIG.TELEGRAM_CHAT_ID, message, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      logger.error('Failed to send Telegram daily summary:', error);
    }
  }

  /**
   * Send error alert
   */
  async sendError(error: string): Promise<void> {
    if (!this.enabled || !this.bot || !CONFIG.TELEGRAM_CHAT_ID) return;

    const message = `⚠️ *ERROR*\n\n\`${this.escapeMarkdown(error)}\``;

    try {
      await this.bot.telegram.sendMessage(CONFIG.TELEGRAM_CHAT_ID, message, {
        parse_mode: 'Markdown',
      });
    } catch (err) {
      logger.error('Failed to send Telegram error alert:', err);
    }
  }

  /**
   * Escape markdown special characters
   */
  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }

  /**
   * Check if Telegram is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

export const telegramService = new TelegramService();
