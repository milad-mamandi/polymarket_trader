import { describe, it, expect } from '@jest/globals';
import {
  truncateAddress,
  timeAgo,
  walletAgeInHours,
  formatUSD,
  formatPercent,
  calculateWinRate,
  generateId,
  sleep,
  parseNumber,
  clamp,
} from '../../../src/utils/helpers.js';

describe('helpers', () => {
  describe('truncateAddress', () => {
    it('should truncate long addresses', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const result = truncateAddress(address);
      expect(result).toBe('0x1234...5678');
    });

    it('should return short addresses unchanged', () => {
      const address = '0x123';
      const result = truncateAddress(address);
      expect(result).toBe('0x123');
    });

    it('should use custom start/end chars', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const result = truncateAddress(address, 4, 3);
      expect(result).toBe('0x12...678');
    });
  });

  describe('timeAgo', () => {
    it('should format seconds', () => {
      const now = Date.now();
      const fiveSecondsAgo = now - 5000;
      const result = timeAgo(fiveSecondsAgo);
      expect(result).toMatch(/\ds ago/);
    });

    it('should format minutes', () => {
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;
      const result = timeAgo(fiveMinutesAgo);
      expect(result).toBe('5m ago');
    });

    it('should format hours', () => {
      const now = Date.now();
      const twoHoursAgo = now - 2 * 60 * 60 * 1000;
      const result = timeAgo(twoHoursAgo);
      expect(result).toBe('2h ago');
    });

    it('should format days', () => {
      const now = Date.now();
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
      const result = timeAgo(threeDaysAgo);
      expect(result).toBe('3d ago');
    });

    it('should accept Date objects', () => {
      const date = new Date(Date.now() - 1000);
      const result = timeAgo(date);
      expect(result).toMatch(/\ds ago/);
    });

    it('should accept ISO strings', () => {
      const isoString = new Date(Date.now() - 60000).toISOString();
      const result = timeAgo(isoString);
      expect(result).toBe('1m ago');
    });
  });

  describe('walletAgeInHours', () => {
    it('should calculate age in hours from Date', () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const age = walletAgeInHours(oneDayAgo);
      expect(age).toBeCloseTo(24, 1);
    });

    it('should calculate age in hours from string', () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const age = walletAgeInHours(oneDayAgo);
      expect(age).toBeCloseTo(24, 1);
    });
  });

  describe('formatUSD', () => {
    it('should format positive amounts', () => {
      expect(formatUSD(1234.56)).toBe('$1,234.56');
    });

    it('should format negative amounts', () => {
      expect(formatUSD(-1234.56)).toBe('-$1,234.56');
    });

    it('should handle zero', () => {
      expect(formatUSD(0)).toBe('$0.00');
    });

    it('should include cents', () => {
      expect(formatUSD(10)).toBe('$10.00');
    });
  });

  describe('formatPercent', () => {
    it('should format decimals as percentages', () => {
      expect(formatPercent(0.5)).toBe('50.0%');
    });

    it('should use custom decimal places', () => {
      expect(formatPercent(0.12345, 2)).toBe('12.35%');
    });

    it('should handle zero', () => {
      expect(formatPercent(0)).toBe('0.0%');
    });

    it('should handle 100%', () => {
      expect(formatPercent(1)).toBe('100.0%');
    });
  });

  describe('calculateWinRate', () => {
    it('should return 0 when no trades', () => {
      expect(calculateWinRate(0, 0)).toBe(0);
    });

    it('should calculate correct rate', () => {
      expect(calculateWinRate(7, 3)).toBe(0.7);
    });

    it('should handle 100% win rate', () => {
      expect(calculateWinRate(10, 0)).toBe(1);
    });

    it('should handle 0% win rate', () => {
      expect(calculateWinRate(0, 10)).toBe(0);
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should return string with timestamp', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^\d+-/);
    });
  });

  describe('sleep', () => {
    it('should wait for specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(90);
    });
  });

  describe('parseNumber', () => {
    it('should parse numeric strings', () => {
      expect(parseNumber('123')).toBe(123);
      expect(parseNumber('123.45')).toBe(123.45);
    });

    it('should return numbers unchanged', () => {
      expect(parseNumber(123)).toBe(123);
    });

    it('should return default for invalid strings', () => {
      expect(parseNumber('abc')).toBe(0);
      expect(parseNumber('abc', 10)).toBe(10);
    });

    it('should return default for undefined', () => {
      expect(parseNumber(undefined)).toBe(0);
      expect(parseNumber(undefined, 5)).toBe(5);
    });
  });

  describe('clamp', () => {
    it('should clamp values below minimum', () => {
      expect(clamp(5, 10, 20)).toBe(10);
    });

    it('should clamp values above maximum', () => {
      expect(clamp(25, 10, 20)).toBe(20);
    });

    it('should return value if within range', () => {
      expect(clamp(15, 10, 20)).toBe(15);
    });

    it('should handle edge cases', () => {
      expect(clamp(10, 10, 20)).toBe(10);
      expect(clamp(20, 10, 20)).toBe(20);
    });
  });
});
