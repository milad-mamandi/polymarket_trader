import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../../../utils/logger.js';
import { monitor } from '../../../index.js';
import { resetTradingData } from '../../../models/database.js';
import { tradeEngine } from '../../../services/tradeEngine.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * Bot status tracking
 */
let botStatus = {
  running: false,
  startTime: null as number | null,
  lastError: null as string | null,
};

/**
 * GET /api/bot/status
 * Get current bot status
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    // Sync with actual monitor status
    const monitorRunning = monitor.isRunning();
    if (monitorRunning !== botStatus.running) {
      botStatus.running = monitorRunning;
      if (!monitorRunning) {
        botStatus.startTime = null;
      }
    }
    
    const uptime = botStatus.startTime 
      ? Math.floor((Date.now() - botStatus.startTime) / 1000)
      : 0;
    
    res.json({
      running: botStatus.running,
      startTime: botStatus.startTime,
      uptime,
      lastError: botStatus.lastError,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting bot status: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to get bot status' });
  }
});

/**
 * POST /api/bot/start
 * Start the monitoring bot
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    if (botStatus.running) {
      res.status(400).json({ error: 'Bot is already running' });
      return;
    }
    
    logger.info('Starting bot via dashboard...');
    botStatus.running = true;
    botStatus.startTime = Date.now();
    botStatus.lastError = null;
    
    // Start monitor in background (don't await)
    monitor.start().catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Bot error: ${errorMessage}`);
      botStatus.running = false;
      botStatus.lastError = errorMessage;
    });
    
    res.json({ 
      success: true, 
      message: 'Bot started successfully',
      startTime: botStatus.startTime,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error starting bot: ${errorMessage}`);
    botStatus.running = false;
    botStatus.lastError = errorMessage;
    res.status(500).json({ error: 'Failed to start bot' });
  }
});

/**
 * POST /api/bot/stop
 * Stop the monitoring bot
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    if (!botStatus.running) {
      res.status(400).json({ error: 'Bot is not running' });
      return;
    }
    
    logger.info('Stopping bot via dashboard...');
    
    // Call monitor's stop method
    monitor.stop();
    
    botStatus.running = false;
    botStatus.startTime = null;
    
    res.json({ 
      success: true, 
      message: 'Bot stopped successfully',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error stopping bot: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to stop bot' });
  }
});

/**
 * POST /api/bot/restart
 * Restart the monitoring bot
 */
router.post('/restart', async (req: Request, res: Response) => {
  try {
    logger.info('Restarting bot via dashboard...');
    
    // Stop first (if running)
    if (botStatus.running || monitor.isRunning()) {
      monitor.stop();
      botStatus.running = false;
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s for cleanup
    }
    
    // Start again
    botStatus.running = true;
    botStatus.startTime = Date.now();
    botStatus.lastError = null;
    
    monitor.start().catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Bot error: ${errorMessage}`);
      botStatus.running = false;
      botStatus.lastError = errorMessage;
    });
    
    res.json({ 
      success: true, 
      message: 'Bot restarted successfully',
      startTime: botStatus.startTime,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error restarting bot: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to restart bot' });
  }
});

/**
 * POST /api/bot/reset
 * Reset all trading data (paper trades and performance history)
 */
router.post('/reset', async (req: Request, res: Response) => {
  try {
    logger.info('Resetting trading data via dashboard...');
    
    // Reset database (clears paper_trades and performance tables)
    resetTradingData();
    
    // Reset trade engine balance to initial value
    tradeEngine.reset();
    
    res.json({ 
      success: true, 
      message: 'Trading data reset successfully. All paper trades and performance history cleared.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error resetting data: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to reset trading data' });
  }
});

/**
 * Update bot status (called by monitor)
 */
export function updateBotStatus(running: boolean, error?: string) {
  botStatus.running = running;
  if (error) {
    botStatus.lastError = error;
  }
  if (!running) {
    botStatus.startTime = null;
  }
}

/**
 * Get bot status (for WebSocket broadcasts)
 */
export function getBotStatus() {
  return { ...botStatus };
}

export default router;
