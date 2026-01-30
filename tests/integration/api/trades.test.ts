import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import { Express } from 'express';
import { createTestApp, createAuthenticatedAgent, seedTestData, seedPaperTrades, cleanupTestData } from '../helpers.js';
import { createTestDatabase, closeMockDatabase, getMockDatabase } from '../../mocks/database.js';

describe('Trades API Integration', () => {
  let app: Express;
  let agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>;

  beforeAll(async () => {
    createTestDatabase();
    app = createTestApp();
    agent = await createAuthenticatedAgent(app);
  });

  beforeEach(() => {
    const db = getMockDatabase();
    cleanupTestData(db);
    seedTestData(db);
    seedPaperTrades();
  });

  afterAll(() => {
    closeMockDatabase();
  });

  describe('GET /api/trades/stats', () => {
    it('should return trade statistics', async () => {
      const response = await agent
        .get('/api/trades/stats')
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('open');
      expect(response.body).toHaveProperty('winning');
      expect(response.body).toHaveProperty('losing');
    });

    it('should require authentication', async () => {
      await request(app).get('/api/trades/stats').expect(401);
    });
  });

  describe('GET /api/trades', () => {
    it('should return list of trades', async () => {
      const response = await agent
        .get('/api/trades')
        .expect(200);

      expect(response.body).toHaveProperty('trades');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.trades)).toBe(true);
    });

    it('should accept limit query parameter', async () => {
      const response = await agent
        .get('/api/trades?limit=10')
        .expect(200);

      expect(response.body.trades.length).toBeLessThanOrEqual(10);
    });

    it('should filter by status', async () => {
      const response = await agent
        .get('/api/trades?status=OPEN')
        .expect(200);

      const allOpen = response.body.trades.every((t: any) => t.status === 'OPEN');
      expect(allOpen).toBe(true);
    });

    it('should require authentication', async () => {
      await request(app).get('/api/trades').expect(401);
    });
  });

  describe('GET /api/trades/:id', () => {
    it('should return single trade details', async () => {
      // First get a trade ID
      const listResponse = await agent.get('/api/trades').expect(200);
      const firstTrade = listResponse.body.trades[0];

      if (firstTrade) {
        const response = await agent
          .get(`/api/trades/${firstTrade.id}`)
          .expect(200);

        expect(response.body.id).toBe(firstTrade.id);
        expect(response.body).toHaveProperty('market_title');
        expect(response.body).toHaveProperty('outcome');
      }
    });

    it('should return 404 for non-existent trade', async () => {
      await agent
        .get('/api/trades/non-existent-id')
        .expect(404);
    });

    it('should require authentication', async () => {
      await request(app).get('/api/trades/any-id').expect(401);
    });
  });
});
