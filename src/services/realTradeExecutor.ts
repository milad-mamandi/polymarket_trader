import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from '../config/settings.js';
import { logger } from '../utils/logger.js';
import { clobClient } from './polymarket/clobClient.js';
import { Side } from '@polymarket/clob-client';
import { getTokenIdForOutcome } from './polymarket/tokenResolver.js';
import { polymarketApi } from './polymarket/api.js';
import {
  insertRealTrade,
  updateRealTradeOrder,
  markRealTradeFailed,
  getTodaySpending,
  RealTradeInsert,
  getOpenRealTrades,
} from '../models/realTrade.js';
import { DetectedWallet } from './walletScanner.js';
import { isKillSwitchActivated } from '../core/killSwitch.js';
import { sleep } from '../utils/helpers.js';

/**
 * Real Trade Executor - Handles actual on-chain trades via Polymarket CLOB
 * Includes safety checks: daily limits, position limits, trading hours, kill switch
 */

export interface RealTradeParams {
  wallet: DetectedWallet;
  marketId: string;
  marketTitle: string;
  outcome: string;
  amountUsd: number;
  confidence: number;
}

export interface RealTradeResult {
  success: boolean;
  tradeId?: string;
  orderId?: string;
  error?: string;
}

/**
 * Execute a real trade with safety checks
 */
export async function executeRealTrade(params: RealTradeParams): Promise<RealTradeResult> {
  const { wallet, marketId, marketTitle, outcome, amountUsd, confidence } = params;

  logger.info(
    `Attempting real trade: ${outcome} on "${marketTitle}" ($${amountUsd.toFixed(2)}) - Confidence: ${confidence}%`
  );

  // Safety check 1: Kill switch (check both config and file-based activation)
  if (isKillSwitchActivated()) {
    logger.warn('Real trading KILL SWITCH is ENABLED - trade blocked');
    return { success: false, error: 'Kill switch enabled' };
  }

  // Safety check 2: Trading mode
  if (!CONFIG.REAL_TRADING_ENABLED) {
    logger.warn('Real trading is disabled - use paper trading mode');
    return { success: false, error: 'Real trading disabled' };
  }
  
  // Safety check 2.5: Dry run mode
  if (CONFIG.REAL_TRADING_DRY_RUN) {
    logger.info(`[DRY RUN] Would execute real trade: ${outcome} on "${marketTitle}" ($${amountUsd.toFixed(2)})`);
    return { success: false, error: 'Dry run mode - trade not executed' };
  }

  // Safety check 3: Trading hours (UTC)
  const currentHour = new Date().getUTCHours();
  if (currentHour < CONFIG.REAL_TRADING_START_HOUR || currentHour >= CONFIG.REAL_TRADING_END_HOUR) {
    logger.warn(
      `Trade blocked - outside trading hours (${CONFIG.REAL_TRADING_START_HOUR}:00-${CONFIG.REAL_TRADING_END_HOUR}:00 UTC)`
    );
    return { success: false, error: 'Outside trading hours' };
  }

  // Safety check 4: Position size limit
  if (amountUsd > CONFIG.REAL_TRADING_MAX_POSITION_USD) {
    logger.warn(
      `Trade blocked - amount $${amountUsd} exceeds max position size $${CONFIG.REAL_TRADING_MAX_POSITION_USD}`
    );
    return { success: false, error: 'Exceeds max position size' };
  }

  // Safety check 5: Daily spending limit
  const todaySpending = getTodaySpending();
  if (todaySpending + amountUsd > CONFIG.REAL_TRADING_DAILY_LIMIT_USD) {
    logger.warn(
      `Trade blocked - would exceed daily limit ($${(todaySpending + amountUsd).toFixed(2)} > $${CONFIG.REAL_TRADING_DAILY_LIMIT_USD})`
    );
    return {
      success: false,
      error: `Daily limit exceeded ($${todaySpending.toFixed(2)}/$${CONFIG.REAL_TRADING_DAILY_LIMIT_USD})`,
    };
  }
  
  // Safety check 6: Duplicate trade prevention
  const openTrades = getOpenRealTrades();
  const existingTrade = openTrades.find(
    t => t.market_id === marketId && t.outcome === outcome
  );
  
  if (existingTrade) {
    logger.warn(
      `Trade blocked - already have open position on ${marketTitle} for ${outcome} (Trade ID: ${existingTrade.id})`
    );
    return { success: false, error: 'Duplicate trade - position already open' };
  }

  // Initialize CLOB client if not already initialized
  if (!clobClient.isInitialized()) {
    try {
      await clobClient.initialize();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize CLOB client: ${errorMessage}`);
      return { success: false, error: 'CLOB client initialization failed' };
    }
  }

  // Resolve token ID for outcome
  let tokenId: string;
  try {
    tokenId = await getTokenIdForOutcome(marketId, outcome);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to resolve token ID: ${errorMessage}`);
    return { success: false, error: 'Token resolution failed' };
  }

  // Get best available price
  let price: number;
  try {
    const bestPrice = await clobClient.getBestPrice(tokenId, Side.BUY);
    if (!bestPrice) {
      logger.error('No liquidity available for this outcome');
      return { success: false, error: 'No liquidity available' };
    }
    
    // Safety check 7: Slippage protection
    const maxSlippageMultiplier = 1 + (CONFIG.REAL_TRADING_MAX_SLIPPAGE_PERCENT / 100);
    const maxAcceptablePrice = Math.min(bestPrice * maxSlippageMultiplier, 0.99);
    
    price = bestPrice;
    
    logger.info(`Best price: $${bestPrice.toFixed(4)}, Max acceptable (with ${CONFIG.REAL_TRADING_MAX_SLIPPAGE_PERCENT}% slippage): $${maxAcceptablePrice.toFixed(4)}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to get best price: ${errorMessage}`);
    return { success: false, error: 'Price fetch failed' };
  }

  // Calculate shares to buy
  const shares = amountUsd / price;
  
  // Safety check 8: Minimum order size
  if (shares < CONFIG.REAL_TRADING_MIN_SHARES) {
    logger.warn(
      `Trade blocked - order size too small (${shares.toFixed(2)} shares < ${CONFIG.REAL_TRADING_MIN_SHARES} minimum)`
    );
    return { success: false, error: `Order too small (min ${CONFIG.REAL_TRADING_MIN_SHARES} shares)` };
  }
  
  // Safety check 9: Confirmation delay
  if (CONFIG.REAL_TRADING_CONFIRMATION_DELAY_MS > 0) {
    logger.info(`Waiting ${CONFIG.REAL_TRADING_CONFIRMATION_DELAY_MS}ms before executing real trade...`);
    await sleep(CONFIG.REAL_TRADING_CONFIRMATION_DELAY_MS);
    
    // Re-check kill switch after delay
    if (isKillSwitchActivated()) {
      logger.warn('Kill switch activated during confirmation delay - trade cancelled');
      return { success: false, error: 'Kill switch activated during delay' };
    }
  }

  // Safety check 10: Market status validation (CRITICAL - prevents trading on ended markets)
  try {
    const market = await polymarketApi.getMarketByConditionId(marketId, 'debug');
    
    if (!market) {
      logger.warn(`Trade blocked - Market not found or archived: ${marketTitle}`);
      return { success: false, error: 'Market not found or archived' };
    }

    if (market.resolved) {
      logger.warn(`Trade blocked - Market already resolved: ${marketTitle}`);
      return { success: false, error: 'Market already resolved' };
    }

    if (market.closed) {
      logger.warn(`Trade blocked - Market is closed: ${marketTitle}`);
      return { success: false, error: 'Market is closed' };
    }

    if (!market.active) {
      logger.warn(`Trade blocked - Market is not active: ${marketTitle}`);
      return { success: false, error: 'Market is not active' };
    }

    if (market.endDate) {
      const endDate = new Date(market.endDate);
      const now = new Date();
      
      if (endDate < now) {
        logger.warn(`Trade blocked - Market ended on ${market.endDate}: ${marketTitle}`);
        return { success: false, error: `Market ended on ${market.endDate}` };
      }

      // Check if market ends within 24 hours
      const hoursUntilEnd = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (hoursUntilEnd < 24) {
        logger.warn(`Trade blocked - Market ends in ${Math.round(hoursUntilEnd)} hours (min 24h required): ${marketTitle}`);
        return { success: false, error: `Market ends in ${Math.round(hoursUntilEnd)} hours (min 24h required)` };
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to validate market status: ${errorMessage}`);
    return { success: false, error: 'Market status validation failed' };
  }

  // Create trade record
  const tradeId = uuidv4();
  const tradeInsert: RealTradeInsert = {
    id: tradeId,
    triggered_by: wallet.address,
    market_id: marketId,
    token_id: tokenId,
    market_title: marketTitle,
    outcome,
    order_type: 'LIMIT',
    entry_price: price,
    amount_usd: amountUsd,
    shares,
    confidence_score: confidence,
  };

  try {
    insertRealTrade(tradeInsert);
    logger.info(`Created real trade record: ${tradeId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to create trade record: ${errorMessage}`);
    return { success: false, error: 'Database error' };
  }

  // Place order on CLOB
  try {
    const order = await clobClient.placeLimitOrder({
      tokenID: tokenId,
      price,
      size: shares,
      side: Side.BUY,
    });

    // Update trade record with order details
    updateRealTradeOrder(tradeId, order.orderID, order.transactionHash);

    logger.info(`✅ Real trade executed successfully: ${tradeId} (Order: ${order.orderID})`);
    logger.info(`   Market: ${marketTitle}`);
    logger.info(`   Outcome: ${outcome}`);
    logger.info(`   Amount: $${amountUsd.toFixed(2)}`);
    logger.info(`   Price: $${price.toFixed(4)}`);
    logger.info(`   Shares: ${shares.toFixed(2)}`);

    return {
      success: true,
      tradeId,
      orderId: order.orderID,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to execute real trade: ${errorMessage}`);

    // Mark trade as failed
    markRealTradeFailed(tradeId);

    return { success: false, error: errorMessage };
  }
}

/**
 * Get current safety status
 */
export function getSafetyStatus(): {
  killSwitchEnabled: boolean;
  tradingEnabled: boolean;
  withinTradingHours: boolean;
  todaySpending: number;
  dailyLimit: number;
  remainingBudget: number;
  dryRunMode: boolean;
} {
  const currentHour = new Date().getUTCHours();
  const withinTradingHours =
    currentHour >= CONFIG.REAL_TRADING_START_HOUR && currentHour < CONFIG.REAL_TRADING_END_HOUR;

  const todaySpending = getTodaySpending();
  const remainingBudget = Math.max(0, CONFIG.REAL_TRADING_DAILY_LIMIT_USD - todaySpending);

  return {
    killSwitchEnabled: isKillSwitchActivated(),
    tradingEnabled: CONFIG.REAL_TRADING_ENABLED,
    withinTradingHours,
    todaySpending,
    dailyLimit: CONFIG.REAL_TRADING_DAILY_LIMIT_USD,
    remainingBudget,
    dryRunMode: CONFIG.REAL_TRADING_DRY_RUN,
  };
}
