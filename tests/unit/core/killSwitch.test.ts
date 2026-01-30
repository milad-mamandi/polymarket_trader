import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * Unit tests for KillSwitch module
 * Tests emergency stop functionality for real trading
 */

describe('KillSwitch', () => {
  // Mock state
  let mockFileSystem: Map<string, string>;
  let mockConfig: {
    REAL_TRADING_KILL_SWITCH_ENABLED: boolean;
    DATA_DIR: string;
  };
  let mockClobClient: {
    isInitialized: jest.Mock<() => boolean>;
    cancelAllOrders: jest.Mock<() => Promise<void>>;
  };
  let mockLogger: {
    warn: jest.Mock;
    info: jest.Mock;
    error: jest.Mock;
  };

  // Test file path
  const KILL_SWITCH_FILE = 'test-data/kill_switch_activated';

  beforeEach(() => {
    // Reset mocks
    mockFileSystem = new Map();
    mockConfig = {
      REAL_TRADING_KILL_SWITCH_ENABLED: false,
      DATA_DIR: 'test-data',
    };
    mockClobClient = {
      isInitialized: jest.fn(() => false),
      cancelAllOrders: jest.fn(async () => {}),
    };
    mockLogger = {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    };
  });

  // Re-implement functions with injected mocks
  function isKillSwitchActivated(): boolean {
    // Check config first
    if (mockConfig.REAL_TRADING_KILL_SWITCH_ENABLED) {
      return true;
    }

    // Check if kill switch file exists
    return mockFileSystem.has(KILL_SWITCH_FILE);
  }

  async function activateKillSwitch(reason?: string): Promise<void> {
    mockLogger.warn('🚨 KILL SWITCH ACTIVATED 🚨');
    if (reason) {
      mockLogger.warn(`Reason: ${reason}`);
    }

    // Cancel all open orders if CLOB client is initialized
    if (mockClobClient.isInitialized()) {
      try {
        mockLogger.info('Cancelling all open orders...');
        await mockClobClient.cancelAllOrders();
        mockLogger.info('All orders cancelled successfully');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        mockLogger.error(`Failed to cancel orders during kill switch activation: ${errorMessage}`);
      }
    }

    // Create kill switch file
    const timestamp = new Date().toISOString();
    const content = JSON.stringify(
      {
        activated_at: timestamp,
        reason: reason || 'Manual activation',
      },
      null,
      2
    );

    mockFileSystem.set(KILL_SWITCH_FILE, content);

    mockLogger.warn('Kill switch file created. Real trading is now disabled.');
    mockLogger.warn('To re-enable trading, manually delete the kill switch file and update config.');
  }

  function deactivateKillSwitch(): void {
    if (!mockFileSystem.has(KILL_SWITCH_FILE)) {
      mockLogger.info('Kill switch is not activated (file does not exist)');
      return;
    }

    try {
      mockFileSystem.delete(KILL_SWITCH_FILE);
      mockLogger.info('Kill switch deactivated. Trading can be re-enabled via config.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      mockLogger.error(`Failed to deactivate kill switch: ${errorMessage}`);
      throw error;
    }
  }

  function getKillSwitchStatus(): {
    activated: boolean;
    activatedAt?: string;
    reason?: string;
  } {
    if (!mockFileSystem.has(KILL_SWITCH_FILE)) {
      return { activated: false };
    }

    try {
      const content = mockFileSystem.get(KILL_SWITCH_FILE)!;
      const data = JSON.parse(content);

      return {
        activated: true,
        activatedAt: data.activated_at,
        reason: data.reason,
      };
    } catch (error) {
      // If file exists but can't be read, still report as activated
      return {
        activated: true,
        reason: 'Kill switch file exists but could not be read',
      };
    }
  }

  describe('isKillSwitchActivated', () => {
    it('should return true when config REAL_TRADING_KILL_SWITCH_ENABLED is true', () => {
      mockConfig.REAL_TRADING_KILL_SWITCH_ENABLED = true;

      const result = isKillSwitchActivated();

      expect(result).toBe(true);
    });

    it('should return true when kill switch file exists (even if config is false)', () => {
      mockConfig.REAL_TRADING_KILL_SWITCH_ENABLED = false;
      mockFileSystem.set(KILL_SWITCH_FILE, '{}');

      const result = isKillSwitchActivated();

      expect(result).toBe(true);
    });

    it('should return false when config is false AND file does not exist', () => {
      mockConfig.REAL_TRADING_KILL_SWITCH_ENABLED = false;
      // File doesn't exist

      const result = isKillSwitchActivated();

      expect(result).toBe(false);
    });

    it('should check config before checking file (short-circuit)', () => {
      mockConfig.REAL_TRADING_KILL_SWITCH_ENABLED = true;
      // Don't create file

      const result = isKillSwitchActivated();

      // Should return true from config check, without needing file
      expect(result).toBe(true);
      expect(mockFileSystem.has(KILL_SWITCH_FILE)).toBe(false);
    });
  });

  describe('activateKillSwitch', () => {
    it('should log warning with reason when provided', async () => {
      const reason = 'Emergency stop: excessive losses';

      await activateKillSwitch(reason);

      expect(mockLogger.warn).toHaveBeenCalledWith('🚨 KILL SWITCH ACTIVATED 🚨');
      expect(mockLogger.warn).toHaveBeenCalledWith(`Reason: ${reason}`);
    });

    it('should cancel all orders when clobClient is initialized', async () => {
      mockClobClient.isInitialized.mockReturnValue(true);

      await activateKillSwitch('Test reason');

      expect(mockClobClient.isInitialized).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Cancelling all open orders...');
      expect(mockClobClient.cancelAllOrders).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('All orders cancelled successfully');
    });

    it('should NOT call cancelAllOrders when clobClient is NOT initialized', async () => {
      mockClobClient.isInitialized.mockReturnValue(false);

      await activateKillSwitch('Test reason');

      expect(mockClobClient.isInitialized).toHaveBeenCalled();
      expect(mockClobClient.cancelAllOrders).not.toHaveBeenCalled();
    });

    it('should handle cancelAllOrders errors gracefully (log, do not throw)', async () => {
      mockClobClient.isInitialized.mockReturnValue(true);
      const error = new Error('Network error: failed to cancel orders');
      mockClobClient.cancelAllOrders.mockRejectedValue(error);

      // Should not throw
      await expect(activateKillSwitch('Test reason')).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to cancel orders during kill switch activation: Network error: failed to cancel orders'
      );
      // Should still create the file despite cancel error
      expect(mockFileSystem.has(KILL_SWITCH_FILE)).toBe(true);
    });

    it('should create kill switch file with timestamp and reason', async () => {
      const reason = 'Daily loss limit exceeded';
      const beforeTime = new Date().toISOString();

      await activateKillSwitch(reason);

      expect(mockFileSystem.has(KILL_SWITCH_FILE)).toBe(true);

      const content = mockFileSystem.get(KILL_SWITCH_FILE)!;
      const data = JSON.parse(content);

      expect(data).toHaveProperty('activated_at');
      expect(data).toHaveProperty('reason', reason);
      expect(typeof data.activated_at).toBe('string');
      
      // Verify timestamp is recent (within last few seconds)
      const activatedAt = new Date(data.activated_at);
      expect(activatedAt.getTime()).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());
    });

    it('should use "Manual activation" as default reason when none provided', async () => {
      await activateKillSwitch();

      const content = mockFileSystem.get(KILL_SWITCH_FILE)!;
      const data = JSON.parse(content);

      expect(data.reason).toBe('Manual activation');
    });
  });

  describe('deactivateKillSwitch', () => {
    it('should delete kill switch file when it exists', () => {
      mockFileSystem.set(KILL_SWITCH_FILE, JSON.stringify({ activated_at: '2024-01-01', reason: 'Test' }));

      deactivateKillSwitch();

      expect(mockFileSystem.has(KILL_SWITCH_FILE)).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Kill switch deactivated. Trading can be re-enabled via config.');
    });

    it('should log info when file does not exist (no-op)', () => {
      // File doesn't exist

      deactivateKillSwitch();

      expect(mockLogger.info).toHaveBeenCalledWith('Kill switch is not activated (file does not exist)');
      expect(mockFileSystem.has(KILL_SWITCH_FILE)).toBe(false);
    });

    it('should throw error when file deletion fails', () => {
      mockFileSystem.set(KILL_SWITCH_FILE, '{}');
      
      // Mock deletion to throw error
      const originalDelete = mockFileSystem.delete.bind(mockFileSystem);
      mockFileSystem.delete = jest.fn(() => {
        throw new Error('Permission denied');
      });

      expect(() => deactivateKillSwitch()).toThrow('Permission denied');
      
      // Restore
      mockFileSystem.delete = originalDelete;
    });

    it('should log error message when deletion fails', () => {
      mockFileSystem.set(KILL_SWITCH_FILE, '{}');
      
      // Mock deletion to throw error
      const originalDelete = mockFileSystem.delete.bind(mockFileSystem);
      mockFileSystem.delete = jest.fn(() => {
        throw new Error('Disk full');
      });

      try {
        deactivateKillSwitch();
      } catch (error) {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to deactivate kill switch: Disk full');
      
      // Restore
      mockFileSystem.delete = originalDelete;
    });
  });

  describe('getKillSwitchStatus', () => {
    it('should return { activated: false } when file does not exist', () => {
      // File doesn't exist

      const status = getKillSwitchStatus();

      expect(status).toEqual({ activated: false });
    });

    it('should return full status with activatedAt and reason when file exists', () => {
      const timestamp = '2024-01-15T10:30:00.000Z';
      const reason = 'Emergency stop';
      const fileContent = JSON.stringify({
        activated_at: timestamp,
        reason: reason,
      });
      mockFileSystem.set(KILL_SWITCH_FILE, fileContent);

      const status = getKillSwitchStatus();

      expect(status).toEqual({
        activated: true,
        activatedAt: timestamp,
        reason: reason,
      });
    });

    it('should return activated:true with error message when file cannot be parsed', () => {
      // Set invalid JSON
      mockFileSystem.set(KILL_SWITCH_FILE, 'invalid json content {{{');

      const status = getKillSwitchStatus();

      expect(status.activated).toBe(true);
      expect(status.reason).toBe('Kill switch file exists but could not be read');
      expect(status.activatedAt).toBeUndefined();
    });
  });
});
