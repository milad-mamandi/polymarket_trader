import { initializeDatabase } from './models/database.js';
import { getDashboardServer } from './web/server/index.js';
import { CONFIG } from './config/settings.js';
import { logger } from './utils/logger.js';

/**
 * Main entry point for Whale Scout Dashboard
 */
async function main() {
  logger.info('🐋 Polymarket Whale Scout starting...');
  
  // Initialize database
  try {
    initializeDatabase();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to initialize database: ${errorMessage}`);
    process.exit(1);
  }
  
  // Start dashboard server
  try {
    const server = getDashboardServer(CONFIG.DASHBOARD_PORT);
    await server.start();
    
    logger.info(`✅ Dashboard ready at http://localhost:${CONFIG.DASHBOARD_PORT}`);
    logger.info('📊 Login with your dashboard password to start monitoring');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to start dashboard server: ${errorMessage}`);
    process.exit(1);
  }
  
  // Graceful shutdown handler
  const shutdown = async () => {
    logger.info('Shutting down Whale Scout...');
    try {
      const server = getDashboardServer();
      await server.stop();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error during shutdown: ${errorMessage}`);
      process.exit(1);
    }
  };
  
  // Handle shutdown signals
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception: ${error.message}`);
    logger.error(error.stack || '');
    shutdown();
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection:', reason);
    shutdown();
  });
}

// Start the application
main().catch(err => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  logger.error(`Fatal error: ${errorMessage}`);
  process.exit(1);
});
