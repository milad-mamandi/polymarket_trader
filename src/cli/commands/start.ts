import { Command } from 'commander';
import { monitor, getDashboardServer } from '../../index.js';
import { logger } from '../../utils/logger.js';
import { CONFIG } from '../../config/settings.js';

export const startCommand = new Command('start')
  .description('Start the whale scout monitoring bot')
  .option('-d, --dashboard', 'Start web dashboard alongside bot')
  .action(async (options) => {
    try {
      logger.info('🚀 Starting Polymarket Whale Scout...');
      
      // Start dashboard if requested and enabled
      if (options.dashboard && CONFIG.DASHBOARD_ENABLED) {
        logger.info('Starting web dashboard...');
        const server = getDashboardServer();
        await server.start();
      }
      
      // Start bot monitor
      await monitor.start();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to start bot: ${errorMessage}`);
      process.exit(1);
    }
  });
