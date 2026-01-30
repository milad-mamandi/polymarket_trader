import { ClobClient, Side, type ApiKeyCreds } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import { CONFIG } from '../../config/settings.js';
import { logger } from '../../utils/logger.js';

/**
 * Polymarket CLOB (Central Limit Order Book) Client
 * Handles real trading operations on Polymarket
 */

export interface OrderParams {
  tokenID: string;
  price: number;
  size: number;
  side: Side;
  feeRateBps?: number;
}

export interface PlacedOrder {
  orderID: string;
  transactionHash?: string;
  status: string;
}

export interface OrderStatus {
  orderID: string;
  status: 'LIVE' | 'MATCHED' | 'CANCELLED' | 'EXPIRED';
  price: number;
  size: number;
  sizeFilled: number;
  timestamp: number;
}

class PolymarketClobClient {
  private client: ClobClient | null = null;
  private wallet: ethers.Wallet | null = null;
  private initialized = false;

  /**
   * Initialize the CLOB client with credentials
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('CLOB client already initialized');
      return;
    }

    if (!CONFIG.REAL_TRADING_ENABLED) {
      logger.info('Real trading disabled, skipping CLOB client initialization');
      return;
    }

    if (!CONFIG.REAL_TRADING_PRIVATE_KEY) {
      throw new Error('REAL_TRADING_PRIVATE_KEY is required for real trading');
    }

    try {
      logger.info('Initializing Polymarket CLOB client...');

      // Create wallet from private key
      this.wallet = new ethers.Wallet(CONFIG.REAL_TRADING_PRIVATE_KEY);
      logger.info(`Wallet address: ${this.wallet.address}`);

      // Initialize CLOB client
      this.client = new ClobClient(
        CONFIG.CLOB_API,
        CONFIG.REAL_TRADING_CHAIN_ID,
        this.wallet,
        undefined, // ApiKeyCreds - will be set via deriveApiKey
        CONFIG.REAL_TRADING_SIGNATURE_TYPE
      );

      // Derive API credentials
      await this.client.deriveApiKey();

      this.initialized = true;
      logger.info('CLOB client initialized successfully');

      // Log balance
      const balance = await this.getBalance();
      logger.info(`USDC Balance: $${balance.toFixed(2)}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize CLOB client: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.client !== null;
  }

  /**
   * Get USDC balance
   */
  async getBalance(): Promise<number> {
    this.ensureInitialized();

    try {
      const response = await this.client!.getBalanceAllowance();
      return parseFloat(response.balance);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get balance: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Place a limit order (GTC - Good Till Cancelled)
   */
  async placeLimitOrder(params: OrderParams): Promise<PlacedOrder> {
    this.ensureInitialized();

    // Validate price (must be between 0 and 1)
    if (params.price <= 0 || params.price >= 1) {
      throw new Error(`Invalid price: ${params.price}. Polymarket prices must be between 0 and 1.`);
    }
    
    // Validate size (must be positive)
    if (params.size <= 0) {
      throw new Error(`Invalid size: ${params.size}. Size must be greater than 0.`);
    }

    try {
      logger.info(`Placing limit order: ${params.side} ${params.size} shares @ $${params.price}`);

      const result = await this.client!.createAndPostOrder({
        tokenID: params.tokenID,
        price: params.price,
        size: params.size,
        side: params.side,
        feeRateBps: params.feeRateBps || 0,
      });

      logger.info(`Order placed successfully: ${result.orderID}`);

      return {
        orderID: result.orderID,
        transactionHash: result.transactionHash,
        status: result.status,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to place limit order: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Place a market order (FOK - Fill Or Kill)
   */
  async placeMarketOrder(params: OrderParams): Promise<PlacedOrder> {
    this.ensureInitialized();
    
    // Validate size (must be positive)
    if (params.size <= 0) {
      throw new Error(`Invalid size: ${params.size}. Size must be greater than 0.`);
    }

    try {
      logger.info(`Placing market order: ${params.side} ${params.size} shares`);

      const result = await this.client!.createAndPostMarketOrder({
        tokenID: params.tokenID,
        amount: params.size,
        side: params.side,
        feeRateBps: params.feeRateBps || 0,
      });

      logger.info(`Market order placed successfully: ${result.orderID}`);

      return {
        orderID: result.orderID,
        transactionHash: result.transactionHash,
        status: result.status,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to place market order: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderID: string): Promise<void> {
    this.ensureInitialized();

    try {
      logger.info(`Cancelling order: ${orderID}`);
      await this.client!.cancelOrder({ orderID });
      logger.info(`Order cancelled successfully: ${orderID}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to cancel order ${orderID}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Cancel all orders for a token
   */
  async cancelAllOrders(tokenID?: string): Promise<void> {
    this.ensureInitialized();

    try {
      logger.info(tokenID ? `Cancelling all orders for token ${tokenID}` : 'Cancelling all orders');
      
      // Note: ClobClient v5.2.1 only has cancelAll() which cancels all orders
      // No per-token cancellation available in this version
      await this.client!.cancelAll();
      
      logger.info('All orders cancelled successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to cancel all orders: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderID: string): Promise<OrderStatus | null> {
    this.ensureInitialized();

    try {
      const order = await this.client!.getOrder(orderID);
      
      if (!order) {
        return null;
      }

      return {
        orderID: order.id,
        status: order.status as 'LIVE' | 'MATCHED' | 'CANCELLED' | 'EXPIRED',
        price: parseFloat(order.price),
        size: parseFloat(order.original_size),
        sizeFilled: parseFloat(order.size_matched || '0'),
        timestamp: order.created_at,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get order status for ${orderID}: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Get all open orders
   */
  async getOpenOrders(): Promise<OrderStatus[]> {
    this.ensureInitialized();

    try {
      const orders = await this.client!.getOpenOrders();
      
      return orders
        .filter((order: any) => order.status === 'LIVE')
        .map((order: any) => ({
          orderID: order.id,
          status: order.status,
          price: parseFloat(order.price),
          size: parseFloat(order.original_size),
          sizeFilled: parseFloat(order.size_matched || '0'),
          timestamp: order.created_at,
        }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get open orders: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Get order book for a token
   */
  async getOrderBook(tokenID: string): Promise<{ bids: Array<[number, number]>, asks: Array<[number, number]> }> {
    this.ensureInitialized();

    try {
      const book = await this.client!.getOrderBook(tokenID);
      
      return {
        bids: book.bids.map((b: any) => [parseFloat(b.price), parseFloat(b.size)]),
        asks: book.asks.map((a: any) => [parseFloat(a.price), parseFloat(a.size)]),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get order book for ${tokenID}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get best available price for a side
   */
  async getBestPrice(tokenID: string, side: Side): Promise<number | null> {
    try {
      const book = await this.getOrderBook(tokenID);
      
      if (side === Side.BUY && book.asks.length > 0) {
        return book.asks[0][0]; // Best ask (lowest sell price)
      }
      
      if (side === Side.SELL && book.bids.length > 0) {
        return book.bids[0][0]; // Best bid (highest buy price)
      }
      
      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get best price: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Ensure client is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new Error('CLOB client not initialized. Call initialize() first.');
    }
  }
}

// Export singleton instance
export const clobClient = new PolymarketClobClient();
