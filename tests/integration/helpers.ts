/**
 * Integration Test Helpers
 * Shared utilities for API integration tests
 */

import express, { Express } from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createTestDatabase, clearTestDatabase } from '../mocks/database.js';
import { mockWallets, mockWalletInserts } from '../fixtures/wallets.js';
import { mockWalletTrades } from '../fixtures/trades.js';
import { upsertWallet } from '../../src/models/wallet.js';
import { insertWalletTrade } from '../../src/models/trade.js';
import { insertPaperTrade, PaperTradeInsert } from '../../src/models/paperTrade.js';
import { insertRealTrade, RealTradeInsert } from '../../src/models/realTrade.js';
import { createSession } from '../../src/web/server/middleware/auth.js';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';

// Import routes
import authRoutes from '../../src/web/server/routes/auth.js';
import apiRoutes from '../../src/web/server/routes/api.js';
import controlRoutes from '../../src/web/server/routes/controls.js';
import configRoutes from '../../src/web/server/routes/config.js';

/**
 * Create Express app with all routes mounted
 * Suitable for supertest integration testing
 */
export function createTestApp(): Express {
  const app = express();
  
  // Middleware
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());
  
  // Mount routes
  app.use('/api/auth', authRoutes);
  app.use('/api', apiRoutes);
  app.use('/api/bot', controlRoutes);
  app.use('/api/config', configRoutes);
  
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  return app;
}

/**
 * Create supertest agent with valid authentication session
 * Returns agent with session cookie set
 */
export async function createAuthenticatedAgent(app: Express): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  
  // Login to get session cookie
  await agent
    .post('/api/auth/login')
    .send({ password: process.env.DASHBOARD_PASSWORD || 'testpassword123' })
    .expect(200);
  
  return agent;
}

/**
 * Seed test database with wallets and trades
 */
export function seedTestData(db: Database.Database): void {
  // Insert wallets
  for (const walletKey in mockWalletInserts) {
    upsertWallet(mockWalletInserts[walletKey as keyof typeof mockWalletInserts]);
  }
  
  // Insert wallet trades with unique IDs
  for (const tradeKey in mockWalletTrades) {
    const trade = mockWalletTrades[tradeKey as keyof typeof mockWalletTrades];
    // Create a new trade object with a unique ID
    const tradeWithNewId = {
      ...trade,
      id: `test-trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    insertWalletTrade(tradeWithNewId);
  }
}

/**
 * Seed paper trades for testing
 */
export function seedPaperTrades(): void {
  const timestamp = Date.now();
  const paperTrades: PaperTradeInsert[] = [
    {
      id: `paper-trade-${timestamp}-1`,
      triggered_by: mockWallets.whale.address,
      market_id: '0xtest-market-1',
      market_title: 'Will Bitcoin reach $100k?',
      outcome: 'Yes',
      entry_price: 0.65,
      virtual_amount: 1000,
      shares: 1538.46,
      confidence_score: 78,
    },
    {
      id: `paper-trade-${timestamp}-2`,
      triggered_by: mockWallets.newSuspicious.address,
      market_id: '0xtest-market-2',
      market_title: 'Trump wins 2024?',
      outcome: 'No',
      entry_price: 0.45,
      virtual_amount: 500,
      shares: 1111.11,
      confidence_score: 65,
    },
  ];
  
  paperTrades.forEach(trade => {
    insertPaperTrade(trade);
  });
}

/**
 * Seed real trades for testing (if real trading enabled)
 */
export function seedRealTrades(): void {
  const realTrades: RealTradeInsert[] = [
    {
      id: 'real-trade-1',
      triggered_by: mockWallets.whale.address,
      market_id: '0xtest-market-3',
      token_id: '0xtoken-yes',
      market_title: 'ETH reaches $5k?',
      outcome: 'Yes',
      order_type: 'LIMIT',
      entry_price: 0.72,
      amount_usd: 250,
      shares: 347.22,
      confidence_score: 82,
    },
  ];
  
  realTrades.forEach(trade => {
    insertRealTrade(trade);
  });
}

/**
 * Clear all test data from database
 */
export function cleanupTestData(db: Database.Database): void {
  clearTestDatabase(db);
}

/**
 * Create a mock session cookie for testing without login
 */
export function createMockSessionCookie(): string {
  const sessionId = 'test-session-' + Date.now();
  // This creates a cookie but doesn't verify - useful for testing auth failures
  return `sessionId=${sessionId}; Path=/; HttpOnly`;
}

/**
 * Extract session cookie from response headers
 */
export function extractSessionCookie(response: request.Response): string | null {
  const cookiesHeader = response.headers['set-cookie'];
  if (!cookiesHeader) return null;
  
  // Handle both string and string[] cases
  const cookies = Array.isArray(cookiesHeader) ? cookiesHeader : [cookiesHeader];
  if (cookies.length === 0) return null;
  
  const sessionCookie = cookies.find((cookie: string) => cookie.startsWith('sessionId='));
  if (!sessionCookie) return null;
  
  // Extract just the sessionId=value part
  const match = sessionCookie.match(/sessionId=([^;]+)/);
  return match ? `sessionId=${match[1]}` : null;
}

/**
 * Helper to wait for async operations
 */
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get test config overrides
 */
export function getTestConfig() {
  return {
    WHALE_THRESHOLD_USD: 10000,
    NEW_WALLET_AGE_HOURS: 48,
    PAPER_TRADING_INITIAL_BALANCE: 10000,
    REAL_TRADING_ENABLED: false,
    TRADING_MODE: 'paper',
    DASHBOARD_PASSWORD: 'testpassword123',
  };
}

/**
 * Mock request with session
 */
export function createMockAuthRequest(sessionId: string) {
  return {
    cookies: {
      sessionId,
    },
    session: {
      sessionId,
      loginTime: Date.now(),
    },
  };
}
