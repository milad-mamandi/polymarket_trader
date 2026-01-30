import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config/settings.js';
import { logger } from '../utils/logger.js';
import { clobClient } from '../services/polymarket/clobClient.js';

/**
 * Emergency Kill Switch for Real Trading
 * When activated:
 * 1. Cancels all open orders
 * 2. Disables trading immediately
 * 3. Persists state to file
 * 4. Requires manual re-enable
 */

const KILL_SWITCH_FILE = path.join(CONFIG.DATA_DIR, 'kill_switch_activated');

/**
 * Check if kill switch is activated
 */
export function isKillSwitchActivated(): boolean {
  // Check config first
  if (CONFIG.REAL_TRADING_KILL_SWITCH_ENABLED) {
    return true;
  }

  // Check if kill switch file exists
  return fs.existsSync(KILL_SWITCH_FILE);
}

/**
 * Activate the kill switch (emergency stop)
 */
export async function activateKillSwitch(reason?: string): Promise<void> {
  logger.warn('🚨 KILL SWITCH ACTIVATED 🚨');
  if (reason) {
    logger.warn(`Reason: ${reason}`);
  }

  // Cancel all open orders if CLOB client is initialized
  if (clobClient.isInitialized()) {
    try {
      logger.info('Cancelling all open orders...');
      await clobClient.cancelAllOrders();
      logger.info('All orders cancelled successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to cancel orders during kill switch activation: ${errorMessage}`);
    }
  }

  // Create kill switch file
  const timestamp = new Date().toISOString();
  const content = JSON.stringify(
    {
      activated_at: timestamp,
      reason: reason || 'Manual activation',
    },
    null,
    2
  );

  fs.writeFileSync(KILL_SWITCH_FILE, content, 'utf-8');

  logger.warn('Kill switch file created. Real trading is now disabled.');
  logger.warn('To re-enable trading, manually delete the kill switch file and update config.');
}

/**
 * Deactivate the kill switch (manual restore)
 */
export function deactivateKillSwitch(): void {
  if (!fs.existsSync(KILL_SWITCH_FILE)) {
    logger.info('Kill switch is not activated (file does not exist)');
    return;
  }

  try {
    fs.unlinkSync(KILL_SWITCH_FILE);
    logger.info('Kill switch deactivated. Trading can be re-enabled via config.');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to deactivate kill switch: ${errorMessage}`);
    throw error;
  }
}

/**
 * Get kill switch status and details
 */
export function getKillSwitchStatus(): {
  activated: boolean;
  activatedAt?: string;
  reason?: string;
} {
  if (!fs.existsSync(KILL_SWITCH_FILE)) {
    return { activated: false };
  }

  try {
    const content = fs.readFileSync(KILL_SWITCH_FILE, 'utf-8');
    const data = JSON.parse(content);

    return {
      activated: true,
      activatedAt: data.activated_at,
      reason: data.reason,
    };
  } catch (error) {
    // If file exists but can't be read, still report as activated
    return {
      activated: true,
      reason: 'Kill switch file exists but could not be read',
    };
  }
}
