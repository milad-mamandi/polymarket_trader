import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { Express } from 'express';
import { createTestApp, extractSessionCookie } from '../helpers.js';
import { createTestDatabase, closeMockDatabase } from '../../mocks/database.js';

describe('Auth API Integration', () => {
  let app: Express;
  const TEST_PASSWORD = process.env.DASHBOARD_PASSWORD || 'testpassword123';

  beforeAll(() => {
    // Create test database
    createTestDatabase();
    
    // Create Express app
    app = createTestApp();
  });

  afterAll(() => {
    closeMockDatabase();
  });

  describe('POST /api/auth/login', () => {
    it('should return 400 if password is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Password required');
    });

    it('should return 401 for invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'wrongpassword' })
        .expect(401);

      expect(response.body.error).toBe('Invalid password');
    });

    it('should return 200 and set cookie for valid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: TEST_PASSWORD })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Login successful');

      // Check session cookie is set
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      
      const cookiesArray = Array.isArray(cookies) ? cookies : [cookies];
      const hasSessionCookie = cookiesArray.some((cookie: string) => 
        cookie.startsWith('sessionId=')
      );
      expect(hasSessionCookie).toBe(true);
    });

    it('should create valid session that can be used for auth', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ password: TEST_PASSWORD })
        .expect(200);

      const sessionCookie = extractSessionCookie(loginResponse);
      expect(sessionCookie).toBeTruthy();

      // Use session cookie to access protected route
      const protectedResponse = await request(app)
        .get('/api/auth/check')
        .set('Cookie', sessionCookie!)
        .expect(200);

      expect(protectedResponse.body.authenticated).toBe(true);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should destroy session and return success', async () => {
      // First login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ password: TEST_PASSWORD })
        .expect(200);

      const sessionCookie = extractSessionCookie(loginResponse);

      // Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', sessionCookie!)
        .expect(200);

      expect(logoutResponse.body.success).toBe(true);
      expect(logoutResponse.body.message).toBe('Logged out successfully');

      // Verify session is invalid after logout
      await request(app)
        .get('/api/auth/check')
        .set('Cookie', sessionCookie!)
        .expect(401);
    });
  });

  describe('GET /api/auth/check', () => {
    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .get('/api/auth/check')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });

    it('should return 401 with invalid session cookie', async () => {
      await request(app)
        .get('/api/auth/check')
        .set('Cookie', 'sessionId=invalid-session-id')
        .expect(401);
    });

    it('should return authenticated:true with valid session', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ password: TEST_PASSWORD })
        .expect(200);

      const sessionCookie = extractSessionCookie(loginResponse);

      // Check auth status
      const response = await request(app)
        .get('/api/auth/check')
        .set('Cookie', sessionCookie!)
        .expect(200);

      expect(response.body.authenticated).toBe(true);
      expect(response.body.loginTime).toBeDefined();
      expect(typeof response.body.loginTime).toBe('number');
    });
  });

  describe('Authentication flow', () => {
    it('should complete full auth lifecycle', async () => {
      // 1. Login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ password: TEST_PASSWORD })
        .expect(200);

      const sessionCookie = extractSessionCookie(loginRes);
      expect(sessionCookie).toBeTruthy();

      // 2. Access protected route
      await request(app)
        .get('/api/stats/overview')
        .set('Cookie', sessionCookie!)
        .expect(200);

      // 3. Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Cookie', sessionCookie!)
        .expect(200);

      // 4. Verify can't access protected route after logout
      await request(app)
        .get('/api/stats/overview')
        .set('Cookie', sessionCookie!)
        .expect(401);
    });
  });
});
