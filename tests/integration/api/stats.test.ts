import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import { Express } from 'express';
import { createTestApp, createAuthenticatedAgent, seedTestData, seedPaperTrades, cleanupTestData } from '../helpers.js';
import { createTestDatabase, closeMockDatabase, getMockDatabase } from '../../mocks/database.js';

describe('Stats API Integration', () => {
  let app: Express;
  let agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>;

  beforeAll(async () => {
    // Create test database
    createTestDatabase();
    
    // Create Express app
    app = createTestApp();
    
    // Create authenticated agent
    agent = await createAuthenticatedAgent(app);
  });

  beforeEach(() => {
    // Clear and seed data before each test
    const db = getMockDatabase();
    cleanupTestData(db);
    seedTestData(db);
    seedPaperTrades();
  });

  afterAll(() => {
    closeMockDatabase();
  });

  describe('GET /api/stats/overview', () => {
    it('should return portfolio overview', async () => {
      const response = await agent
        .get('/api/stats/overview')
        .expect(200);

      expect(response.body).toHaveProperty('portfolio');
      expect(response.body).toHaveProperty('trades');
      expect(response.body).toHaveProperty('wallets');
      expect(response.body).toHaveProperty('performance');
    });

    it('should have correct portfolio structure', async () => {
      const response = await agent
        .get('/api/stats/overview')
        .expect(200);

      const { portfolio } = response.body;
      expect(portfolio).toHaveProperty('balance');
      expect(portfolio).toHaveProperty('startingBalance');
      expect(portfolio).toHaveProperty('pnl');
      expect(portfolio).toHaveProperty('pnlPercent');
      expect(portfolio).toHaveProperty('roi');
      expect(portfolio).toHaveProperty('openPositionsValue');
      
      expect(typeof portfolio.balance).toBe('number');
      expect(typeof portfolio.pnl).toBe('number');
    });

    it('should have correct trades statistics', async () => {
      const response = await agent
        .get('/api/stats/overview')
        .expect(200);

      const { trades } = response.body;
      expect(trades).toHaveProperty('total');
      expect(trades).toHaveProperty('open');
      expect(trades).toHaveProperty('won');
      expect(trades).toHaveProperty('lost');
      expect(trades).toHaveProperty('cancelled');
      expect(trades).toHaveProperty('winRate');
      
      expect(typeof trades.total).toBe('number');
      expect(typeof trades.winRate).toBe('number');
    });

    it('should have wallet statistics', async () => {
      const response = await agent
        .get('/api/stats/overview')
        .expect(200);

      const { wallets } = response.body;
      expect(wallets).toHaveProperty('total');
      expect(wallets).toHaveProperty('totalTrades');
      
      expect(wallets.total).toBeGreaterThan(0);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/stats/overview')
        .expect(401);
    });
  });

  describe('GET /api/stats/performance', () => {
    it('should return performance history', async () => {
      const response = await agent
        .get('/api/stats/performance')
        .expect(200);

      expect(response.body).toHaveProperty('history');
      expect(response.body).toHaveProperty('period');
      expect(Array.isArray(response.body.history)).toBe(true);
    });

    it('should accept days query parameter', async () => {
      const response = await agent
        .get('/api/stats/performance?days=7')
        .expect(200);

      expect(response.body.period).toBe(7);
    });

    it('should default to 30 days', async () => {
      const response = await agent
        .get('/api/stats/performance')
        .expect(200);

      expect(response.body.period).toBe(30);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/stats/performance')
        .expect(401);
    });
  });

  describe('GET /api/stats/daily', () => {
    it('should return today statistics', async () => {
      const response = await agent
        .get('/api/stats/daily')
        .expect(200);

      expect(response.body).toHaveProperty('date');
      expect(response.body).toHaveProperty('totalSignals');
      expect(response.body).toHaveProperty('tradesExecuted');
      expect(response.body).toHaveProperty('totalPnl');
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/stats/daily')
        .expect(401);
    });
  });
});
