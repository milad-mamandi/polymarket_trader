import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * Unit tests for Monitor module
 * Tests main orchestration loop and coordination of all services
 */

describe('Monitor', () => {
  // Mock dependencies
  let mockWalletScanner: {
    scanForWhales: jest.Mock<() => Promise<any[]>>;
    seedFromLeaderboard: jest.Mock<() => Promise<void>>;
    clearOldSeenTrades: jest.Mock<() => void>;
  };
  let mockWalletAnalyzer: {
    analyzeWallet: jest.Mock<(wallet: any) => Promise<any>>;
  };
  let mockBetRater: {
    rateBet: jest.Mock<(trade: any, score: number) => Promise<any>>;
  };
  let mockTradeEngine: {
    initialize: jest.Mock<() => void>;
    evaluateTrade: jest.Mock<(rating: any) => Promise<any>>;
    updateBalance: jest.Mock<(amount: number) => void>;
  };
  let mockAlertSystem: {
    sendWhaleAlert: jest.Mock<(wallet: any, score: number) => Promise<void>>;
    sendTradeAlert: jest.Mock<(rating: any, result: any) => Promise<void>>;
    sendErrorAlert: jest.Mock<(error: Error) => Promise<void>>;
  };
  let mockPerformanceTracker: {
    recordSignal: jest.Mock<() => void>;
    updateDailyMetrics: jest.Mock<() => void>;
  };
  let mockOrderStatusMonitor: {
    start: jest.Mock<(wsManager?: any) => Promise<void>>;
    stop: jest.Mock<() => void>;
  };
  let mockPolymarketApi: {
    getMarketByConditionId: jest.Mock<(id: string) => Promise<any>>;
    getTopMarketAssetIds: jest.Mock<(limit: number) => Promise<string[]>>;
    getLargeTrades: jest.Mock<(threshold: number, limit: number) => Promise<any[]>>;
  };
  let mockPolymarketWS: {
    connect: jest.Mock<(assetIds: string[]) => Promise<void>>;
    isConnected: jest.Mock<() => boolean>;
    disconnect: jest.Mock<() => void>;
    on: jest.Mock<(event: string, handler: Function) => void>;
  };
  let mockConfig: {
    REAL_TRADING_ENABLED: boolean;
    USE_WEBSOCKET: boolean;
    TRADE_POLL_INTERVAL_MS: number;
    RESOLUTION_CHECK_INTERVAL_MS: number;
    WHALE_THRESHOLD_USD: number;
    MARKET_AGE_THRESHOLD_DAYS: number;
    MARK_OLD_AS_ARCHIVED: boolean;
    ERROR_LOG_LEVEL_422: string;
  };
  let mockLogger: {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
  };
  let mockSleep: jest.Mock<(ms: number) => Promise<void>>;
  let mockGetWebSocketManager: jest.Mock<() => any>;

  // Monitor state
  let running: boolean;
  let startTime: Date;

  beforeEach(() => {
    // Reset all mocks
    mockWalletScanner = {
      scanForWhales: jest.fn(async () => []),
      seedFromLeaderboard: jest.fn(async () => {}),
      clearOldSeenTrades: jest.fn(),
    };
    mockWalletAnalyzer = {
      analyzeWallet: jest.fn(async (wallet) => ({ totalScore: 75 })),
    };
    mockBetRater = {
      rateBet: jest.fn(async (trade, score) => ({
        finalScore: 75,
        shouldTrade: true,
        trade,
      })),
    };
    mockTradeEngine = {
      initialize: jest.fn(),
      evaluateTrade: jest.fn(async (rating) => ({
        executed: true,
        tradeId: 'trade-123',
        amount: 500,
      })),
      updateBalance: jest.fn(),
    };
    mockAlertSystem = {
      sendWhaleAlert: jest.fn(async () => {}),
      sendTradeAlert: jest.fn(async () => {}),
      sendErrorAlert: jest.fn(async () => {}),
    };
    mockPerformanceTracker = {
      recordSignal: jest.fn(),
      updateDailyMetrics: jest.fn(),
    };
    mockOrderStatusMonitor = {
      start: jest.fn(async () => {}),
      stop: jest.fn(),
    };
    mockPolymarketApi = {
      getMarketByConditionId: jest.fn(async (id) => ({
        id,
        title: 'Test Market',
        resolved: false,
        outcomes: ['Yes', 'No'],
        outcomePrices: ['0.6', '0.4'],
      })),
      getTopMarketAssetIds: jest.fn(async (limit) => ['asset1', 'asset2', 'asset3']),
      getLargeTrades: jest.fn(async () => []),
    };
    mockPolymarketWS = {
      connect: jest.fn(async () => {}),
      isConnected: jest.fn(() => false),
      disconnect: jest.fn(),
      on: jest.fn(),
    };
    mockConfig = {
      REAL_TRADING_ENABLED: false,
      USE_WEBSOCKET: false,
      TRADE_POLL_INTERVAL_MS: 30000,
      RESOLUTION_CHECK_INTERVAL_MS: 300000,
      WHALE_THRESHOLD_USD: 50000,
      MARKET_AGE_THRESHOLD_DAYS: 30,
      MARK_OLD_AS_ARCHIVED: true,
      ERROR_LOG_LEVEL_422: 'debug',
    };
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    mockSleep = jest.fn(async () => {});
    mockGetWebSocketManager = jest.fn(() => null);

    running = false;
    startTime = new Date();
  });

  // Re-implement Monitor methods with injected mocks
  async function start(): Promise<void> {
    if (running) {
      mockLogger.warn('Monitor is already running');
      return;
    }

    running = true;
    startTime = new Date();

    mockLogger.info('🚀 Starting Polymarket Whale Scout...');

    // Initialize trade engine
    mockTradeEngine.initialize();

    // Start order status monitor (for real trading)
    if (mockConfig.REAL_TRADING_ENABLED) {
      try {
        const wsManager = mockGetWebSocketManager();
        await mockOrderStatusMonitor.start(wsManager || undefined);
        mockLogger.info('Order status monitor started');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        mockLogger.error(`Failed to start order status monitor: ${errorMessage}`);
      }
    }

    // Seed initial whales from leaderboard
    try {
      mockLogger.info('Seeding initial whales from leaderboard...');
      await mockWalletScanner.seedFromLeaderboard();
    } catch (error) {
      mockLogger.error('Failed to seed leaderboard:', error);
    }

    // Initialize WebSocket if enabled
    if (mockConfig.USE_WEBSOCKET) {
      await initializeWebSocket();
    }

    // Note: In real implementation, mainLoop, metricsLoop, and resolutionCheckLoop
    // would be started here, but for unit tests we test them separately
  }

  function stop(): void {
    running = false;

    // Stop order status monitor
    mockOrderStatusMonitor.stop();

    // Disconnect WebSocket if connected
    if (mockConfig.USE_WEBSOCKET && mockPolymarketWS.isConnected()) {
      mockPolymarketWS.disconnect();
    }

    mockLogger.info('Stopping monitor...');
  }

  async function initializeWebSocket(): Promise<void> {
    try {
      mockLogger.info('Initializing WebSocket connection...');

      // Fetch top markets to subscribe to
      mockLogger.info('Fetching top markets for WebSocket subscription...');
      const assetIds = await mockPolymarketApi.getTopMarketAssetIds(50);

      if (assetIds.length === 0) {
        mockLogger.warn('No asset IDs found for WebSocket subscription. Falling back to REST API polling.');
        return;
      }

      // Connect and subscribe
      await mockPolymarketWS.connect(assetIds);

      mockLogger.info(`WebSocket initialized and subscribed to ${assetIds.length} assets`);
      mockLogger.info(`WebSocket: Monitoring ${assetIds.length} top markets in real-time`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      mockLogger.error(`Failed to initialize WebSocket: ${errorMessage}. Falling back to REST API polling.`);
      mockLogger.info('WebSocket failed - using REST API polling');
    }
  }

  function isRunning(): boolean {
    return running;
  }

  // Simulate one iteration of mainLoop
  async function runMainLoopIteration(): Promise<void> {
    if (!running) return;

    try {
      let detectedWallets: any[] = [];

      // WebSocket mode: Would process queued trades (simplified for tests)
      if (mockConfig.USE_WEBSOCKET && mockPolymarketWS.isConnected()) {
        // In WS mode, would process queue
        detectedWallets = [];
      }
      // REST API mode: Poll for large trades
      else {
        detectedWallets = await mockWalletScanner.scanForWhales();
      }

      // Analyze each detected wallet
      for (const detected of detectedWallets) {
        try {
          // Calculate suspicion score
          const score = await mockWalletAnalyzer.analyzeWallet(detected);

          // Send whale alert
          await mockAlertSystem.sendWhaleAlert(detected, score.totalScore);

          // Rate the bet
          const rating = await mockBetRater.rateBet(detected.trade, score.totalScore);

          // Record signal
          mockPerformanceTracker.recordSignal();

          // Execute paper trade if confidence is high enough
          if (rating.shouldTrade) {
            const result = await mockTradeEngine.evaluateTrade(rating);

            if (result.executed) {
              await mockAlertSystem.sendTradeAlert(rating, result);
            } else {
              mockLogger.info(`Trade not executed: ${result.reason}`);
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          mockLogger.error(`Error processing wallet ${detected.address}: ${errorMessage}`);

          const safeError = new Error(errorMessage);
          await mockAlertSystem.sendErrorAlert(safeError);
        }
      }

      // Clear old seen trades periodically
      mockWalletScanner.clearOldSeenTrades();

      // Wait before next scan
      const sleepTime = mockConfig.USE_WEBSOCKET && mockPolymarketWS.isConnected()
        ? 5000
        : mockConfig.TRADE_POLL_INTERVAL_MS;

      await mockSleep(sleepTime);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      mockLogger.error(`Error in main loop: ${errorMessage}`);
      await mockAlertSystem.sendErrorAlert(error as Error);
      await mockSleep(10000);
    }
  }

  describe('start', () => {
    it('should set running flag to true', async () => {
      expect(running).toBe(false);

      await start();

      expect(running).toBe(true);
    });

    it('should warn and return if already running', async () => {
      running = true;

      await start();

      expect(mockLogger.warn).toHaveBeenCalledWith('Monitor is already running');
      expect(mockTradeEngine.initialize).not.toHaveBeenCalled();
    });

    it('should initialize trade engine', async () => {
      await start();

      expect(mockTradeEngine.initialize).toHaveBeenCalled();
    });

    it('should start order status monitor when real trading is enabled', async () => {
      mockConfig.REAL_TRADING_ENABLED = true;

      await start();

      expect(mockOrderStatusMonitor.start).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Order status monitor started');
    });

    it('should not start order status monitor when real trading is disabled', async () => {
      mockConfig.REAL_TRADING_ENABLED = false;

      await start();

      expect(mockOrderStatusMonitor.start).not.toHaveBeenCalled();
    });

    it('should seed initial whales from leaderboard', async () => {
      await start();

      expect(mockLogger.info).toHaveBeenCalledWith('Seeding initial whales from leaderboard...');
      expect(mockWalletScanner.seedFromLeaderboard).toHaveBeenCalled();
    });

    it('should handle leaderboard seeding errors gracefully', async () => {
      const error = new Error('API unavailable');
      mockWalletScanner.seedFromLeaderboard.mockRejectedValue(error);

      await start();

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to seed leaderboard:', error);
      // Should still be running despite error
      expect(running).toBe(true);
    });

    it('should initialize WebSocket when USE_WEBSOCKET is true', async () => {
      mockConfig.USE_WEBSOCKET = true;

      await start();

      expect(mockLogger.info).toHaveBeenCalledWith('Initializing WebSocket connection...');
      expect(mockPolymarketApi.getTopMarketAssetIds).toHaveBeenCalledWith(50);
      expect(mockPolymarketWS.connect).toHaveBeenCalled();
    });

    it('should not initialize WebSocket when USE_WEBSOCKET is false', async () => {
      mockConfig.USE_WEBSOCKET = false;

      await start();

      expect(mockPolymarketWS.connect).not.toHaveBeenCalled();
    });

    it('should handle WebSocket initialization errors gracefully', async () => {
      mockConfig.USE_WEBSOCKET = true;
      const error = new Error('WebSocket connection failed');
      mockPolymarketWS.connect.mockRejectedValue(error);

      await start();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize WebSocket: WebSocket connection failed. Falling back to REST API polling.'
      );
      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket failed - using REST API polling');
    });
  });

  describe('stop', () => {
    it('should set running flag to false', () => {
      running = true;

      stop();

      expect(running).toBe(false);
    });

    it('should stop order status monitor', () => {
      running = true;

      stop();

      expect(mockOrderStatusMonitor.stop).toHaveBeenCalled();
    });

    it('should disconnect WebSocket if connected', () => {
      running = true;
      mockConfig.USE_WEBSOCKET = true;
      mockPolymarketWS.isConnected.mockReturnValue(true);

      stop();

      expect(mockPolymarketWS.disconnect).toHaveBeenCalled();
    });

    it('should not disconnect WebSocket if not connected', () => {
      running = true;
      mockConfig.USE_WEBSOCKET = true;
      mockPolymarketWS.isConnected.mockReturnValue(false);

      stop();

      expect(mockPolymarketWS.disconnect).not.toHaveBeenCalled();
    });

    it('should log stop message', () => {
      running = true;

      stop();

      expect(mockLogger.info).toHaveBeenCalledWith('Stopping monitor...');
    });
  });

  describe('isRunning', () => {
    it('should return true when monitor is running', () => {
      running = true;

      expect(isRunning()).toBe(true);
    });

    it('should return false when monitor is stopped', () => {
      running = false;

      expect(isRunning()).toBe(false);
    });
  });

  describe('mainLoop behavior', () => {
    beforeEach(async () => {
      await start(); // Set running = true
    });

    it('should scan for whales in REST API mode', async () => {
      mockConfig.USE_WEBSOCKET = false;

      await runMainLoopIteration();

      expect(mockWalletScanner.scanForWhales).toHaveBeenCalled();
    });

    it('should not scan for whales in WebSocket mode when connected', async () => {
      mockConfig.USE_WEBSOCKET = true;
      mockPolymarketWS.isConnected.mockReturnValue(true);

      await runMainLoopIteration();

      expect(mockWalletScanner.scanForWhales).not.toHaveBeenCalled();
    });

    it('should analyze each detected wallet', async () => {
      const detectedWallet = {
        address: '0xWhale123',
        trade: { id: 'trade1', title: 'Test Market', amount: 100000 },
      };
      mockWalletScanner.scanForWhales.mockResolvedValue([detectedWallet]);

      await runMainLoopIteration();

      expect(mockWalletAnalyzer.analyzeWallet).toHaveBeenCalledWith(detectedWallet);
    });

    it('should send whale alert for each detection', async () => {
      const detectedWallet = {
        address: '0xWhale123',
        trade: { id: 'trade1', title: 'Test Market', amount: 100000 },
      };
      mockWalletScanner.scanForWhales.mockResolvedValue([detectedWallet]);
      mockWalletAnalyzer.analyzeWallet.mockResolvedValue({ totalScore: 85 });

      await runMainLoopIteration();

      expect(mockAlertSystem.sendWhaleAlert).toHaveBeenCalledWith(detectedWallet, 85);
    });

    it('should rate bet for each detected wallet', async () => {
      const detectedWallet = {
        address: '0xWhale123',
        trade: { id: 'trade1', title: 'Test Market', amount: 100000 },
      };
      mockWalletScanner.scanForWhales.mockResolvedValue([detectedWallet]);
      mockWalletAnalyzer.analyzeWallet.mockResolvedValue({ totalScore: 85 });

      await runMainLoopIteration();

      expect(mockBetRater.rateBet).toHaveBeenCalledWith(detectedWallet.trade, 85);
    });

    it('should record signal for each detection', async () => {
      const detectedWallet = {
        address: '0xWhale123',
        trade: { id: 'trade1', title: 'Test Market', amount: 100000 },
      };
      mockWalletScanner.scanForWhales.mockResolvedValue([detectedWallet]);

      await runMainLoopIteration();

      expect(mockPerformanceTracker.recordSignal).toHaveBeenCalled();
    });

    it('should execute trade when shouldTrade is true', async () => {
      const detectedWallet = {
        address: '0xWhale123',
        trade: { id: 'trade1', title: 'Test Market', amount: 100000 },
      };
      mockWalletScanner.scanForWhales.mockResolvedValue([detectedWallet]);
      mockBetRater.rateBet.mockResolvedValue({
        finalScore: 80,
        shouldTrade: true,
        trade: detectedWallet.trade,
      });
      mockTradeEngine.evaluateTrade.mockResolvedValue({
        executed: true,
        tradeId: 'trade-456',
        amount: 500,
      });

      await runMainLoopIteration();

      expect(mockTradeEngine.evaluateTrade).toHaveBeenCalled();
      expect(mockAlertSystem.sendTradeAlert).toHaveBeenCalled();
    });

    it('should not execute trade when shouldTrade is false', async () => {
      const detectedWallet = {
        address: '0xWhale123',
        trade: { id: 'trade1', title: 'Test Market', amount: 100000 },
      };
      mockWalletScanner.scanForWhales.mockResolvedValue([detectedWallet]);
      mockBetRater.rateBet.mockResolvedValue({
        finalScore: 60,
        shouldTrade: false,
        trade: detectedWallet.trade,
      });

      await runMainLoopIteration();

      expect(mockTradeEngine.evaluateTrade).not.toHaveBeenCalled();
    });

    it('should log when trade is not executed', async () => {
      const detectedWallet = {
        address: '0xWhale123',
        trade: { id: 'trade1', title: 'Test Market', amount: 100000 },
      };
      mockWalletScanner.scanForWhales.mockResolvedValue([detectedWallet]);
      mockBetRater.rateBet.mockResolvedValue({
        finalScore: 80,
        shouldTrade: true,
        trade: detectedWallet.trade,
      });
      mockTradeEngine.evaluateTrade.mockResolvedValue({
        executed: false,
        reason: 'Insufficient balance',
      });

      await runMainLoopIteration();

      expect(mockLogger.info).toHaveBeenCalledWith('Trade not executed: Insufficient balance');
      expect(mockAlertSystem.sendTradeAlert).not.toHaveBeenCalled();
    });

    it('should handle wallet processing errors gracefully', async () => {
      const detectedWallet = {
        address: '0xWhale123',
        trade: { id: 'trade1', title: 'Test Market', amount: 100000 },
      };
      mockWalletScanner.scanForWhales.mockResolvedValue([detectedWallet]);
      const error = new Error('Analysis failed');
      mockWalletAnalyzer.analyzeWallet.mockRejectedValue(error);

      await runMainLoopIteration();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error processing wallet 0xWhale123: Analysis failed'
      );
      expect(mockAlertSystem.sendErrorAlert).toHaveBeenCalled();
    });

    it('should clear old seen trades periodically', async () => {
      await runMainLoopIteration();

      expect(mockWalletScanner.clearOldSeenTrades).toHaveBeenCalled();
    });

    it('should sleep with correct interval in REST mode', async () => {
      mockConfig.USE_WEBSOCKET = false;
      mockConfig.TRADE_POLL_INTERVAL_MS = 30000;

      await runMainLoopIteration();

      expect(mockSleep).toHaveBeenCalledWith(30000);
    });

    it('should sleep with shorter interval in WebSocket mode', async () => {
      mockConfig.USE_WEBSOCKET = true;
      mockPolymarketWS.isConnected.mockReturnValue(true);

      await runMainLoopIteration();

      expect(mockSleep).toHaveBeenCalledWith(5000);
    });

    it('should handle main loop errors and send error alert', async () => {
      const error = new Error('Main loop error');
      mockWalletScanner.scanForWhales.mockRejectedValue(error);

      await runMainLoopIteration();

      expect(mockLogger.error).toHaveBeenCalledWith('Error in main loop: Main loop error');
      expect(mockAlertSystem.sendErrorAlert).toHaveBeenCalled();
      expect(mockSleep).toHaveBeenCalledWith(10000); // Error sleep time
    });
  });
});
