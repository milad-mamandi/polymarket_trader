import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { CONFIG } from '../../../config/settings.js';
import { logger } from '../../../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Editable config keys with metadata
const EDITABLE_CONFIG = [
  // Whale Detection
  { key: 'WHALE_THRESHOLD_USD', type: 'number', category: 'Whale Detection', description: 'Minimum USD size to flag as whale', min: 1000, max: 1000000 },
  { key: 'NEW_WALLET_HOURS', type: 'number', category: 'Whale Detection', description: 'Max wallet age (hours) to flag as suspicious', min: 1, max: 168 },
  
  // Trading
  { key: 'MIN_CONFIDENCE_FOR_TRADE', type: 'number', category: 'Trading', description: 'Minimum confidence score (0-100) to execute trade', min: 0, max: 100 },
  { key: 'INITIAL_PAPER_BALANCE', type: 'number', category: 'Trading', description: 'Starting paper trading balance (USD)', min: 1000, max: 1000000 },
  { key: 'MAX_POSITION_SIZE_PERCENT', type: 'number', category: 'Trading', description: 'Max % of balance per trade', min: 1, max: 100 },
  
  // Timing
  { key: 'TRADE_POLL_INTERVAL_MS', type: 'number', category: 'Timing', description: 'How often to scan for new trades (ms)', min: 5000, max: 300000 },
  { key: 'RESOLUTION_CHECK_INTERVAL_MS', type: 'number', category: 'Timing', description: 'How often to check for resolved markets (ms)', min: 60000, max: 3600000 },
  
  // Data Mode
  { key: 'USE_WEBSOCKET', type: 'boolean', category: 'Data Mode', description: 'Enable WebSocket for real-time data (vs REST polling)' },
  
  // Notifications
  { key: 'TELEGRAM_ENABLED', type: 'boolean', category: 'Notifications', description: 'Enable Telegram notifications' },
  { key: 'TELEGRAM_BOT_TOKEN', type: 'string', category: 'Notifications', description: 'Telegram bot API token', secret: true },
  { key: 'TELEGRAM_CHAT_ID', type: 'string', category: 'Notifications', description: 'Telegram chat ID for notifications' },
];

/**
 * GET /api/config
 * Get current configuration
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const config: Record<string, any> = {};
    
    for (const item of EDITABLE_CONFIG) {
      const value = (CONFIG as any)[item.key];
      
      // Mask secret values
      if (item.secret && value) {
        config[item.key] = {
          value: '***' + value.slice(-4),
          masked: true,
          ...item
        };
      } else {
        config[item.key] = {
          value,
          masked: false,
          ...item
        };
      }
    }
    
    res.json({ config });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching config: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

/**
 * PUT /api/config
 * Update configuration (writes to .env file)
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    
    if (!updates || typeof updates !== 'object') {
      res.status(400).json({ error: 'Invalid request body' });
      return;
    }
    
    // Validate all updates
    const validatedUpdates: Record<string, string> = {};
    const errors: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(updates)) {
      const configItem = EDITABLE_CONFIG.find(c => c.key === key);
      
      if (!configItem) {
        errors[key] = 'Unknown configuration key';
        continue;
      }
      
      // Validate based on type
      if (configItem.type === 'number') {
        const numValue = Number(value);
        if (isNaN(numValue)) {
          errors[key] = 'Must be a number';
          continue;
        }
        if (configItem.min !== undefined && numValue < configItem.min) {
          errors[key] = `Must be at least ${configItem.min}`;
          continue;
        }
        if (configItem.max !== undefined && numValue > configItem.max) {
          errors[key] = `Must be at most ${configItem.max}`;
          continue;
        }
        validatedUpdates[key] = String(numValue);
      } else if (configItem.type === 'boolean') {
        if (value !== true && value !== false && value !== 'true' && value !== 'false') {
          errors[key] = 'Must be true or false';
          continue;
        }
        validatedUpdates[key] = String(value);
      } else if (configItem.type === 'string') {
        if (typeof value !== 'string') {
          errors[key] = 'Must be a string';
          continue;
        }
        validatedUpdates[key] = value;
      }
    }
    
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Validation failed', errors });
      return;
    }
    
    // Read current .env file
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }
    
    // Update or add each key
    for (const [key, value] of Object.entries(validatedUpdates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      
      if (regex.test(envContent)) {
        // Update existing
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        // Add new
        envContent += `\n${key}=${value}`;
      }
    }
    
    // Write back to .env
    fs.writeFileSync(envPath, envContent, 'utf-8');
    
    logger.info(`Configuration updated: ${Object.keys(validatedUpdates).join(', ')}`);
    
    res.json({ 
      success: true, 
      message: 'Configuration updated. Restart the bot for changes to take effect.',
      updated: Object.keys(validatedUpdates)
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error updating config: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

export default router;
