import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { CONFIG } from '../../config/settings.js';
import { logger } from '../../utils/logger.js';
import { 
  WSSubscribeMessage, 
  WSOperationMessage, 
  WSLastTradePrice,
  WSMarketEvent,
  WSMarketResolved,
} from './wsTypes.js';

/**
 * Polymarket WebSocket Client
 * Connects to the Market channel for real-time trade and market updates
 */
export class PolymarketWSClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000;
  private pingInterval: NodeJS.Timeout | null = null;
  private subscribedAssets: Set<string> = new Set();
  private isConnecting = false;

  constructor() {
    super();
  }

  /**
   * Connect to the market channel WebSocket
   */
  async connect(assetIds: string[] = []): Promise<void> {
    if (this.isConnecting) {
      logger.warn('WebSocket connection already in progress');
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      logger.warn('WebSocket already connected');
      return;
    }

    this.isConnecting = true;
    const url = `${CONFIG.WSS_ENDPOINT}market`;
    
    return new Promise((resolve, reject) => {
      try {
        logger.info(`Connecting to Polymarket WebSocket: ${url}`);
        this.ws = new WebSocket(url);

        const connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            logger.error('WebSocket connection timeout');
            this.ws.terminate();
            this.isConnecting = false;
            reject(new Error('Connection timeout'));
          }
        }, 10000);

        this.ws.on('open', () => {
          clearTimeout(connectionTimeout);
          logger.info('WebSocket connected to Polymarket');
          this.reconnectAttempts = 0;
          this.isConnecting = false;
          
          // Subscribe to initial assets
          if (assetIds.length > 0) {
            this.subscribe(assetIds);
          }
          
          // Start ping interval
          this.startPing();
          
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`WebSocket error: ${errorMessage}`);
          this.emit('error', error);
        });

        this.ws.on('close', (code, reason) => {
          logger.warn(`WebSocket connection closed: ${code} - ${reason.toString()}`);
          this.stopPing();
          this.isConnecting = false;
          this.handleReconnect();
        });

      } catch (error) {
        this.isConnecting = false;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to connect WebSocket: ${errorMessage}`);
        reject(error);
      }
    });
  }

  /**
   * Subscribe to asset IDs for real-time updates
   */
  subscribe(assetIds: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('WebSocket not connected, cannot subscribe');
      return;
    }

    const message: WSSubscribeMessage = {
      assets_ids: assetIds,
      type: 'market',
      custom_feature_enabled: true,
    };

    this.ws.send(JSON.stringify(message));
    assetIds.forEach(id => this.subscribedAssets.add(id));
    logger.info(`Subscribed to ${assetIds.length} assets via WebSocket`);
  }

  /**
   * Add more assets to subscription
   */
  addSubscription(assetIds: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('WebSocket not connected, cannot add subscription');
      return;
    }

    const message: WSOperationMessage = {
      assets_ids: assetIds,
      operation: 'subscribe',
    };

    this.ws.send(JSON.stringify(message));
    assetIds.forEach(id => this.subscribedAssets.add(id));
    logger.info(`Added ${assetIds.length} assets to subscription`);
  }

  /**
   * Unsubscribe from assets
   */
  unsubscribe(assetIds: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: WSOperationMessage = {
      assets_ids: assetIds,
      operation: 'unsubscribe',
    };

    this.ws.send(JSON.stringify(message));
    assetIds.forEach(id => this.subscribedAssets.delete(id));
    logger.info(`Unsubscribed from ${assetIds.length} assets`);
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle different event types
      switch (message.event_type) {
        case 'last_trade_price':
          this.emit('trade', message as WSLastTradePrice);
          break;
        case 'book':
          this.emit('book', message);
          break;
        case 'price_change':
          this.emit('price_change', message);
          break;
        case 'new_market':
          this.emit('new_market', message);
          logger.info(`New market detected: ${message.question}`);
          break;
        case 'market_resolved':
          this.emit('market_resolved', message as WSMarketResolved);
          logger.info(`Market resolved via WebSocket: ${message.id}`);
          break;
        default:
          // Ignore unknown event types or pong responses
          if (message.event_type) {
            logger.debug(`Unknown WebSocket event type: ${message.event_type}`);
          }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to parse WebSocket message: ${errorMessage}`);
    }
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 10000); // Ping every 10 seconds
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max WebSocket reconnection attempts reached');
      this.emit('disconnected');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    logger.info(`Reconnecting WebSocket in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(async () => {
      try {
        await this.connect(Array.from(this.subscribedAssets));
      } catch (error) {
        // Will retry again via handleReconnect
      }
    }, delay);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get number of subscribed assets
   */
  getSubscribedCount(): number {
    return this.subscribedAssets.size;
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscribedAssets.clear();
    logger.info('WebSocket disconnected');
  }
}

export const polymarketWS = new PolymarketWSClient();
