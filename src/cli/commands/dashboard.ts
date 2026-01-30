/**
 * Dashboard Command
 * Start web dashboard only (bot runs separately)
 */

import { initializeDatabase } from '../../models/database.js';
import { getDashboardServer } from '../../web/server/index.js';
import { CONFIG } from '../../config/settings.js';
import { logger } from '../../utils/logger.js';

export async function dashboardCommand(options: string[]): Promise<void> {
  console.log('🐋 Starting Whale Scout Dashboard...\n');
  
  // Initialize database
  try {
    initializeDatabase();
    console.log('✅ Database initialized');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to initialize database: ${errorMessage}`);
    process.exit(1);
  }
  
  // Start dashboard server
  try {
    const server = getDashboardServer(CONFIG.DASHBOARD_PORT);
    await server.start();
    
    console.log(`✅ Dashboard started at http://localhost:${CONFIG.DASHBOARD_PORT}`);
    console.log(`   Password: Set in .env (DASHBOARD_PASSWORD)`);
    console.log('\n📊 Dashboard is now running. Press Ctrl+C to stop.\n');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to start dashboard server: ${errorMessage}`);
    process.exit(1);
  }
  
  // Graceful shutdown handler
  const shutdown = async () => {
    console.log('\n\n🛑 Shutting down dashboard...');
    try {
      const server = getDashboardServer();
      await server.stop();
      console.log('✅ Shutdown complete');
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
