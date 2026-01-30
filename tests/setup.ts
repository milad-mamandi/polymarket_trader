/**
 * Test Setup
 * Global configuration and mocks for all tests
 */

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests
process.env.DATA_DIR = ':memory:'; // Use in-memory database for tests
process.env.LOG_TO_FILE = 'false';
process.env.TELEGRAM_ENABLED = 'false';
process.env.DASHBOARD_ENABLED = 'false';
process.env.USE_WEBSOCKET = 'false';
process.env.TRADING_MODE = 'paper';

// Note: Jest timeout is configured in jest.config.ts (testTimeout)
// Note: Console mocking removed for ESM compatibility

// Global test utilities
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const mockTimestamp = '2026-01-30T12:00:00.000Z';

export const generateMockId = () => {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
