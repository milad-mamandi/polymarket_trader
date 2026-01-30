import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { CONFIG } from '../../../config/settings.js';
import { logger } from '../../../utils/logger.js';
import { getKillSwitchStatus, activateKillSwitch, deactivateKillSwitch } from '../../../core/killSwitch.js';
import { getSafetyStatus } from '../../../services/realTradeExecutor.js';
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
  
  // Real Trading Mode
  { key: 'TRADING_MODE', type: 'select', category: 'Real Trading', description: 'Trading mode', options: ['paper', 'real'] },
  { key: 'REAL_TRADING_PRIVATE_KEY', type: 'string', category: 'Real Trading', description: 'Ethereum private key for CLOB authentication', secret: true },
  { key: 'REAL_TRADING_FUNDER_ADDRESS', type: 'string', category: 'Real Trading', description: 'Polymarket proxy wallet address' },
  { key: 'REAL_TRADING_SIGNATURE_TYPE', type: 'number', category: 'Real Trading', description: 'Signature type (0=EOA, 1=Magic, 2=Gnosis)', min: 0, max: 2 },
  
  // Real Trading Safety Limits
  { key: 'REAL_TRADING_MAX_POSITION_USD', type: 'number', category: 'Safety Limits', description: 'Maximum position size per trade (USD)', min: 10, max: 100000 },
  { key: 'REAL_TRADING_DAILY_LIMIT_USD', type: 'number', category: 'Safety Limits', description: 'Maximum total spending per day (USD)', min: 100, max: 1000000 },
  { key: 'REAL_TRADING_START_HOUR', type: 'number', category: 'Safety Limits', description: 'Trading start hour (UTC, 0-23)', min: 0, max: 23 },
  { key: 'REAL_TRADING_END_HOUR', type: 'number', category: 'Safety Limits', description: 'Trading end hour (UTC, 0-23)', min: 0, max: 23 },
  
  // Extra Safety
  { key: 'REAL_TRADING_MIN_SHARES', type: 'number', category: 'Extra Safety', description: 'Minimum shares per order', min: 0.1, max: 100 },
  { key: 'REAL_TRADING_MAX_SLIPPAGE_PERCENT', type: 'number', category: 'Extra Safety', description: 'Maximum slippage tolerance (%)', min: 0, max: 20 },
  { key: 'REAL_TRADING_CONFIRMATION_DELAY_MS', type: 'number', category: 'Extra Safety', description: 'Delay before trade execution (ms, 0=instant)', min: 0, max: 300000 },
  { key: 'REAL_TRADING_DRY_RUN', type: 'boolean', category: 'Extra Safety', description: 'Dry run mode - log trades without executing' },
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
          value: value.length > 8 ? '***' + value.slice(-4) : '***',
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
    
    // Add kill switch status
    const killSwitchStatus = getKillSwitchStatus();
    
    // Add safety status
    const safetyStatus = getSafetyStatus();
    
    res.json({ 
      config,
      killSwitch: killSwitchStatus,
      safetyStatus
    });
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
      } else if (configItem.type === 'select') {
        const options = (configItem as any).options || [];
        if (!options.includes(value)) {
          errors[key] = `Must be one of: ${options.join(', ')}`;
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
    
    // Validation: Don't allow enabling real mode without credentials
    if (validatedUpdates['TRADING_MODE'] === 'real') {
      const privateKey = validatedUpdates['REAL_TRADING_PRIVATE_KEY'] || CONFIG.REAL_TRADING_PRIVATE_KEY;
      if (!privateKey || privateKey.length < 32) {
        errors['TRADING_MODE'] = 'Cannot enable real trading without valid private key';
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

/**
 * POST /api/config/killswitch/activate
 * Activate emergency kill switch
 */
router.post('/killswitch/activate', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    
    await activateKillSwitch(reason || 'Manual activation via dashboard');
    
    logger.warn('Kill switch activated via dashboard');
    
    res.json({ 
      success: true, 
      message: 'Kill switch activated. All open orders cancelled and trading disabled.' 
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error activating kill switch: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to activate kill switch' });
  }
});

/**
 * POST /api/config/killswitch/deactivate
 * Deactivate kill switch
 */
router.post('/killswitch/deactivate', (req: Request, res: Response) => {
  try {
    deactivateKillSwitch();
    
    logger.info('Kill switch deactivated via dashboard');
    
    res.json({ 
      success: true, 
      message: 'Kill switch deactivated. Trading can be re-enabled via configuration.' 
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error deactivating kill switch: ${errorMessage}`);
    res.status(500).json({ error: 'Failed to deactivate kill switch' });
  }
});

export default router;
