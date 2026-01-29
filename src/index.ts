import { initializeDatabase } from './models/database.js';
import { monitor } from './core/monitor.js';
import { logger } from './utils/logger.js';
import { CONFIG } from './config/settings.js';
import chalk from 'chalk';

/**
 * Main entry point for the Polymarket Whale Scout bot
 */
async function main() {
  console.log(chalk.bold.cyan('\n╔═══════════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║') + chalk.bold.white('                   🐋 POLYMARKET WHALE SCOUT v1.0                      ') + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('╠═══════════════════════════════════════════════════════════════════════╣'));
  console.log(chalk.bold.cyan('║') + chalk.white('  A bot to scout whales and suspicious wallets on Polymarket           ') + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('║') + chalk.white('  Mode: PAPER TRADING (No real money at risk)                          ') + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('╚═══════════════════════════════════════════════════════════════════════╝\n'));

  try {
    // Initialize database
    logger.info('Initializing database...');
    initializeDatabase();

    // Display configuration
    console.log(chalk.white('Configuration:'));
    console.log(chalk.gray('─'.repeat(75)));
    console.log(chalk.white(`  Whale Threshold: ${chalk.cyan(`$${CONFIG.WHALE_THRESHOLD_USD.toLocaleString()}`)}`));
    console.log(chalk.white(`  New Wallet Threshold: ${chalk.cyan(`${CONFIG.NEW_WALLET_HOURS} hours`)}`));
    console.log(chalk.white(`  Min Confidence for Trade: ${chalk.cyan(`${CONFIG.MIN_CONFIDENCE_FOR_TRADE}%`)}`));
    console.log(chalk.white(`  Paper Trading Balance: ${chalk.cyan(`$${CONFIG.INITIAL_PAPER_BALANCE.toLocaleString()}`)}`));
    console.log(chalk.white(`  Max Position Size: ${chalk.cyan(`${CONFIG.MAX_POSITION_SIZE_PERCENT}% of portfolio`)}`));
    console.log(chalk.white(`  Scan Interval: ${chalk.cyan(`${CONFIG.TRADE_POLL_INTERVAL_MS / 1000}s`)}`));
    console.log(chalk.white(`  Telegram Alerts: ${CONFIG.TELEGRAM_ENABLED ? chalk.green('Enabled') : chalk.yellow('Disabled')}`));
    console.log(chalk.gray('─'.repeat(75)));
    console.log();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n\nReceived SIGINT, shutting down gracefully...'));
      monitor.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log(chalk.yellow('\n\nReceived SIGTERM, shutting down gracefully...'));
      monitor.stop();
      process.exit(0);
    });

    // Start the monitor
    logger.info('Starting monitor...');
    await monitor.start();

  } catch (error) {
    logger.error('Fatal error:', error);
    console.error(chalk.red('\n❌ Fatal error occurred:'), error);
    process.exit(1);
  }
}

// Run the bot
main().catch((error) => {
  console.error(chalk.red('Unhandled error:'), error);
  process.exit(1);
});
