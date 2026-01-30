import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { executeRealTrade, getSafetyStatus, RealTradeParams } from '../../../src/services/realTradeExecutor.js';
import { CONFIG } from '../../../src/config/settings.js';
import { createTestDatabase } from '../../mocks/database.js';
import { insertRealTrade, updateRealTradeOrder } from '../../../src/models/realTrade.js';
import { upsertWallet } from '../../../src/models/wallet.js';
import { db as globalDb } from '../../../src/models/database.js';
import { mockMarkets, MARKET_IDS, MARKET_TITLES } from '../../fixtures/markets.js';
import { mockDetectedWallets, WHALE_ADDRESS, NEW_SUSPICIOUS_ADDRESS } from '../../fixtures/wallets.js';
import { mockApiTrades } from '../../fixtures/trades.js';
import type { DetectedWallet } from '../../../src/services/walletScanner.js';
import type { Database } from 'better-sqlite3';

describe('RealTradeExecutor', () => {
  let db: Database;
  let originalConfig: any;

  // Helper to create proper test params
  const createTestParams = (overrides: Partial<RealTradeParams> = {}): RealTradeParams => {
    const testWallet: DetectedWallet = {
      ...mockDetectedWallets.whale,
      trade: mockApiTrades.whaleBuy,
    };

    return {
      wallet: testWallet,
      marketId: MARKET_IDS.trump,
      marketTitle: MARKET_TITLES.trump,
      outcome: 'Yes',
      amountUsd: 100,
      confidence: 75,
      ...overrides,
    };
  };

  beforeEach(() => {
    // Create test database
    db = createTestDatabase();

    // CRITICAL: Clear real_trades from global database to prevent test pollution
    // The insertRealTrade() function uses the global db singleton, not our test db
    globalDb.prepare('DELETE FROM real_trades').run();

    // Seed whale wallet in global database (used by insertRealTrade)
    upsertWallet({
      address: WHALE_ADDRESS,
      is_whale: true,
      is_new_suspicious: false,
      suspicion_score: 20,
      total_volume: 500000,
    });

    // Save original config and set test defaults
    originalConfig = { ...CONFIG };
    (CONFIG as any).REAL_TRADING_ENABLED = true;
    (CONFIG as any).REAL_TRADING_KILL_SWITCH_ENABLED = false;
    (CONFIG as any).REAL_TRADING_DRY_RUN = false;
    (CONFIG as any).REAL_TRADING_MAX_POSITION_USD = 1000;
    (CONFIG as any).REAL_TRADING_DAILY_LIMIT_USD = 5000;
    (CONFIG as any).REAL_TRADING_START_HOUR = 0;
    (CONFIG as any).REAL_TRADING_END_HOUR = 24;
    (CONFIG as any).REAL_TRADING_MIN_SHARES = 1;
    (CONFIG as any).REAL_TRADING_MAX_SLIPPAGE_PERCENT = 5;
    (CONFIG as any).REAL_TRADING_CONFIRMATION_DELAY_MS = 0;
  });

  afterEach(() => {
    // Restore original config
    Object.assign(CONFIG, originalConfig);
  });

  describe('executeRealTrade', () => {
    describe('Safety Check: Kill Switch', () => {
      it('should reject trade when REAL_TRADING_KILL_SWITCH_ENABLED is true', async () => {
        (CONFIG as any).REAL_TRADING_KILL_SWITCH_ENABLED = true;

        const params = createTestParams();
        const result = await executeRealTrade(params);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Kill switch');
        expect(result.tradeId).toBeUndefined();
        expect(result.orderId).toBeUndefined();
      });

      it('should allow trade when kill switch is disabled', async () => {
        (CONFIG as any).REAL_TRADING_KILL_SWITCH_ENABLED = false;

        const params = createTestParams();
        const result = await executeRealTrade(params);

        // Will fail later in execution (CLOB client not mocked), but passes kill switch check
        // Success would be false due to CLOB client, not kill switch
        if (!result.success) {
          expect(result.error).not.toContain('Kill switch');
        }
      });
    });

    describe('Safety Check: Trading Mode', () => {
      it('should reject trade when REAL_TRADING_ENABLED is false', async () => {
        (CONFIG as any).REAL_TRADING_ENABLED = false;

        const params = createTestParams();
        const result = await executeRealTrade(params);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Real trading disabled');
      });

      it('should proceed past trading mode check when enabled', async () => {
        (CONFIG as any).REAL_TRADING_ENABLED = true;

        const params = createTestParams();
        const result = await executeRealTrade(params);

        // Should not fail on trading mode check
        if (!result.success) {
          expect(result.error).not.toContain('Real trading disabled');
        }
      });
    });

    describe('Safety Check: Dry Run Mode', () => {
      it('should reject trade in dry run mode with descriptive error', async () => {
        (CONFIG as any).REAL_TRADING_DRY_RUN = true;

        const params = createTestParams();
        const result = await executeRealTrade(params);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Dry run mode');
      });

      it('should proceed when dry run mode is disabled', async () => {
        (CONFIG as any).REAL_TRADING_DRY_RUN = false;

        const params = createTestParams();
        const result = await executeRealTrade(params);

        // Should not fail on dry run check
        if (!result.success) {
          expect(result.error).not.toContain('Dry run mode');
        }
      });
    });

    describe('Safety Check: Position Size Limit', () => {
      it('should reject trade when amount exceeds REAL_TRADING_MAX_POSITION_USD', async () => {
        (CONFIG as any).REAL_TRADING_MAX_POSITION_USD = 1000;

        const params = createTestParams({
          amountUsd: 1500, // Exceeds $1000 limit
        });

        const result = await executeRealTrade(params);

        expect(result.success).toBe(false);
        expect(result.error).toContain('max position size');
      });

      it('should allow trade within position size limit', async () => {
        (CONFIG as any).REAL_TRADING_MAX_POSITION_USD = 1000;

        const params = createTestParams({
          amountUsd: 500, // Within $1000 limit
        });

        const result = await executeRealTrade(params);

        // Should not fail on position size check
        if (!result.success) {
          expect(result.error).not.toContain('max position size');
        }
      });

      it('should allow trade at exact position size limit', async () => {
        (CONFIG as any).REAL_TRADING_MAX_POSITION_USD = 1000;

        const params = createTestParams({
          amountUsd: 1000, // Exactly at limit
        });

        const result = await executeRealTrade(params);

        // Should not fail on position size check
        if (!result.success) {
          expect(result.error).not.toContain('max position size');
        }
      });
    });

    describe('Safety Check: Daily Spending Limit', () => {
      it('should reject trade when today\'s spending + amount exceeds limit', async () => {
        (CONFIG as any).REAL_TRADING_DAILY_LIMIT_USD = 5000;

        // Seed existing trades for today totaling $4700
        const today = new Date().toISOString();
        
        insertRealTrade({
          id: 'existing-trade-1',
          triggered_by: WHALE_ADDRESS,
          market_id: 'other-market-1',
          token_id: 'token-123',
          market_title: 'Other Market 1',
          outcome: 'Yes',
          order_type: 'LIMIT',
          entry_price: 0.5,
          amount_usd: 2500,
          shares: 5000,
          confidence_score: 80,
        });

        insertRealTrade({
          id: 'existing-trade-2',
          triggered_by: WHALE_ADDRESS,
          market_id: 'other-market-2',
          token_id: 'token-456',
          market_title: 'Other Market 2',
          outcome: 'No',
          order_type: 'LIMIT',
          entry_price: 0.6,
          amount_usd: 2200,
          shares: 3667,
          confidence_score: 75,
        });

        // Attempt to add $400 more (would be $5100 total, exceeding $5000 limit)
        const params = createTestParams({
          amountUsd: 400,
        });

        const result = await executeRealTrade(params);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Daily limit');
      });

      it('should allow trade within daily spending budget', async () => {
        (CONFIG as any).REAL_TRADING_DAILY_LIMIT_USD = 5000;

        // Seed existing trade for today totaling $2000
        insertRealTrade({
          id: 'existing-trade-1',
          triggered_by: WHALE_ADDRESS,
          market_id: 'other-market-1',
          token_id: 'token-123',
          market_title: 'Other Market',
          outcome: 'Yes',
          order_type: 'LIMIT',
          entry_price: 0.5,
          amount_usd: 2000,
          shares: 4000,
          confidence_score: 80,
        });

        // Attempt to add $500 more (would be $2500 total, within $5000 limit)
        const params = createTestParams({
          amountUsd: 500,
        });

        const result = await executeRealTrade(params);

        // Should not fail on daily limit check
        if (!result.success) {
          expect(result.error).not.toContain('Daily limit');
        }
      });

      it('should allow trade when no previous spending today', async () => {
        (CONFIG as any).REAL_TRADING_DAILY_LIMIT_USD = 5000;

        // No existing trades for today
        const params = createTestParams({
          amountUsd: 1000,
        });

        const result = await executeRealTrade(params);

        // Should not fail on daily limit check
        if (!result.success) {
          expect(result.error).not.toContain('Daily limit');
        }
      });
    });

    describe('Safety Check: Duplicate Trade Prevention', () => {
      it('should reject duplicate trade for same market and outcome', async () => {
        // Insert a trade and mark it as OPEN (duplicate check only checks OPEN trades)
        const tradeId = 'existing-trade-same-market';
        insertRealTrade({
          id: tradeId,
          triggered_by: WHALE_ADDRESS,
          market_id: MARKET_IDS.trump,
          token_id: 'token-trump-yes',
          market_title: MARKET_TITLES.trump,
          outcome: 'Yes',
          order_type: 'LIMIT',
          entry_price: 0.65,
          amount_usd: 500,
          shares: 769,
          confidence_score: 80,
        });
        
        // Update to OPEN status (insertRealTrade defaults to PENDING)
        updateRealTradeOrder(tradeId, 'order-123');

        // Try to place another trade on same market/outcome
        const params = createTestParams({
          marketId: MARKET_IDS.trump,
          marketTitle: MARKET_TITLES.trump,
          outcome: 'Yes',
        });

        const result = await executeRealTrade(params);

        expect(result.success).toBe(false);
        // The duplicate check runs before CLOB initialization
        expect(result.error).toMatch(/Duplicate trade|position already open/i);
      });

      it('should allow trade for different market', async () => {
        // Insert an open trade for a different market
        insertRealTrade({
          id: 'existing-trade-different-market',
          triggered_by: WHALE_ADDRESS,
          market_id: MARKET_IDS.bitcoin,
          token_id: 'token-btc-yes',
          market_title: MARKET_TITLES.bitcoin,
          outcome: 'Yes',
          order_type: 'LIMIT',
          entry_price: 0.72,
          amount_usd: 500,
          shares: 694,
          confidence_score: 80,
        });

        // Try to place trade on different market
        const params = createTestParams({
          marketId: MARKET_IDS.trump,
          marketTitle: MARKET_TITLES.trump,
          outcome: 'Yes',
        });

        const result = await executeRealTrade(params);

        // Should not fail on duplicate check
        if (!result.success) {
          expect(result.error).not.toContain('Duplicate trade');
        }
      });

      it('should allow trade for same market but different outcome', async () => {
        // Insert an open trade for same market, YES outcome
        insertRealTrade({
          id: 'existing-trade-yes',
          triggered_by: WHALE_ADDRESS,
          market_id: MARKET_IDS.trump,
          token_id: 'token-trump-yes',
          market_title: MARKET_TITLES.trump,
          outcome: 'Yes',
          order_type: 'LIMIT',
          entry_price: 0.65,
          amount_usd: 500,
          shares: 769,
          confidence_score: 80,
        });

        // Try to place trade on same market, NO outcome
        const params = createTestParams({
          marketId: MARKET_IDS.trump,
          marketTitle: MARKET_TITLES.trump,
          outcome: 'No',
        });

        const result = await executeRealTrade(params);

        // Should not fail on duplicate check (different outcome)
        if (!result.success) {
          expect(result.error).not.toContain('Duplicate trade');
        }
      });
    });

    describe('Input Validation', () => {
      it('should handle invalid amount gracefully', async () => {
        const params = createTestParams({
          amountUsd: 0, // Invalid amount
        });

        const result = await executeRealTrade(params);

        expect(result.success).toBe(false);
        // Should fail somewhere (either validation or calculation)
        expect(result.error).toBeDefined();
      });

      it('should handle negative amount gracefully', async () => {
        const params = createTestParams({
          amountUsd: -100, // Negative amount
        });

        const result = await executeRealTrade(params);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('getSafetyStatus', () => {
    it('should return all required fields', () => {
      const status = getSafetyStatus();

      expect(status).toHaveProperty('killSwitchEnabled');
      expect(status).toHaveProperty('tradingEnabled');
      expect(status).toHaveProperty('withinTradingHours');
      expect(status).toHaveProperty('todaySpending');
      expect(status).toHaveProperty('dailyLimit');
      expect(status).toHaveProperty('remainingBudget');
      expect(status).toHaveProperty('dryRunMode');
    });

    it('should reflect kill switch config state', () => {
      (CONFIG as any).REAL_TRADING_KILL_SWITCH_ENABLED = true;
      
      let status = getSafetyStatus();
      expect(status.killSwitchEnabled).toBe(true);

      (CONFIG as any).REAL_TRADING_KILL_SWITCH_ENABLED = false;
      
      status = getSafetyStatus();
      expect(status.killSwitchEnabled).toBe(false);
    });

    it('should reflect trading enabled config state', () => {
      (CONFIG as any).REAL_TRADING_ENABLED = true;
      
      let status = getSafetyStatus();
      expect(status.tradingEnabled).toBe(true);

      (CONFIG as any).REAL_TRADING_ENABLED = false;
      
      status = getSafetyStatus();
      expect(status.tradingEnabled).toBe(false);
    });

    it('should reflect dry run mode config state', () => {
      (CONFIG as any).REAL_TRADING_DRY_RUN = true;
      
      let status = getSafetyStatus();
      expect(status.dryRunMode).toBe(true);

      (CONFIG as any).REAL_TRADING_DRY_RUN = false;
      
      status = getSafetyStatus();
      expect(status.dryRunMode).toBe(false);
    });

    it('should calculate remaining budget from daily spending', () => {
      (CONFIG as any).REAL_TRADING_DAILY_LIMIT_USD = 5000;

      // No trades yet
      let status = getSafetyStatus();
      expect(status.dailyLimit).toBe(5000);
      expect(status.todaySpending).toBe(0);
      expect(status.remainingBudget).toBe(5000);

      // Insert trade for today
      insertRealTrade({
        id: 'today-trade-1',
        triggered_by: WHALE_ADDRESS,
        market_id: 'market-1',
        token_id: 'token-1',
        market_title: 'Test Market',
        outcome: 'Yes',
        order_type: 'LIMIT',
        entry_price: 0.5,
        amount_usd: 2000,
        shares: 4000,
        confidence_score: 80,
      });

      status = getSafetyStatus();
      expect(status.todaySpending).toBe(2000);
      expect(status.remainingBudget).toBe(3000);
    });

    it('should not allow negative remaining budget', () => {
      (CONFIG as any).REAL_TRADING_DAILY_LIMIT_USD = 5000;

      // Insert trades exceeding daily limit
      insertRealTrade({
        id: 'today-trade-1',
        triggered_by: WHALE_ADDRESS,
        market_id: 'market-1',
        token_id: 'token-1',
        market_title: 'Test Market 1',
        outcome: 'Yes',
        order_type: 'LIMIT',
        entry_price: 0.5,
        amount_usd: 3000,
        shares: 6000,
        confidence_score: 80,
      });

      insertRealTrade({
        id: 'today-trade-2',
        triggered_by: WHALE_ADDRESS,
        market_id: 'market-2',
        token_id: 'token-2',
        market_title: 'Test Market 2',
        outcome: 'Yes',
        order_type: 'LIMIT',
        entry_price: 0.5,
        amount_usd: 3000,
        shares: 6000,
        confidence_score: 80,
      });

      const status = getSafetyStatus();
      expect(status.todaySpending).toBe(6000);
      expect(status.remainingBudget).toBe(0); // Should be clamped to 0, not negative
    });

    it('should use configured daily limit value', () => {
      (CONFIG as any).REAL_TRADING_DAILY_LIMIT_USD = 10000;

      const status = getSafetyStatus();
      expect(status.dailyLimit).toBe(10000);
    });
  });
});
