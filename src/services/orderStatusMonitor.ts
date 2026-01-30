import { clobClient, OrderStatus as ClobOrderStatus } from './polymarket/clobClient.js';
import { 
  getOpenRealTrades, 
  getRealTradeById, 
  RealTrade 
} from '../models/realTrade.js';
import { logger } from '../utils/logger.js';
import { CONFIG } from '../config/settings.js';

/**
 * Order Status Monitor
 * Polls Polymarket CLOB for real-time order status updates
 * Broadcasts changes via WebSocket
 */

export type OrderStatusType = 
  | 'PENDING'     // Order created but not yet placed
  | 'OPEN'        // Order live on CLOB
  | 'FILLED'      // Order fully filled
  | 'PARTIALLY_FILLED' // Order partially filled
  | 'CANCELLED'   // Order cancelled
  | 'EXPIRED'     // Order expired
  | 'FAILED';     // Order placement failed

interface OrderStatusChange {
  tradeId: string;
  orderId: string;
  oldStatus: string;
  newStatus: OrderStatusType;
  sizeFilled: number;
  timestamp: number;
}

class OrderStatusMonitor {
  private pollingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private wsManager: any = null; // Will be injected

  /**
   * Start monitoring orders
   */
  async start(wsManager?: any): Promise<void> {
    if (this.isRunning) {
      logger.warn('Order status monitor already running');
      return;
    }

    if (wsManager) {
      this.wsManager = wsManager;
    }

    if (!CONFIG.REAL_TRADING_ENABLED) {
      logger.info('Real trading disabled, order status monitor not started');
      return;
    }

    if (!clobClient.isInitialized()) {
      logger.warn('CLOB client not initialized, order status monitor not started');
      return;
    }

    this.isRunning = true;
    logger.info('Order status monitor started');

    // Start polling loop
    this.pollingInterval = setInterval(() => {
      this.checkOrderStatuses().catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Order status check failed: ${errorMessage}`);
      });
    }, CONFIG.ORDER_STATUS_POLL_INTERVAL || 30000); // Default 30s

    // Run immediately on start
    await this.checkOrderStatuses();
  }

  /**
   * Stop monitoring orders
   */
  stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.isRunning = false;
    logger.info('Order status monitor stopped');
  }

  /**
   * Check order statuses for all open trades
   */
  private async checkOrderStatuses(): Promise<void> {
    try {
      const openTrades = getOpenRealTrades();

      if (openTrades.length === 0) {
        logger.debug('No open real trades to monitor');
        return;
      }

      logger.debug(`Checking status for ${openTrades.length} open orders`);

      for (const trade of openTrades) {
        if (!trade.order_id) {
          // Trade is pending - order not yet placed
          continue;
        }

        await this.checkSingleOrder(trade);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to check order statuses: ${errorMessage}`);
    }
  }

  /**
   * Check status for a single order
   */
  private async checkSingleOrder(trade: RealTrade): Promise<void> {
    if (!trade.order_id) return;

    try {
      const orderStatus = await clobClient.getOrderStatus(trade.order_id);

      if (!orderStatus) {
        logger.warn(`Could not fetch status for order ${trade.order_id}`);
        return;
      }

      // Map CLOB status to internal status
      const newStatus = this.mapClobStatus(orderStatus);
      const oldStatus = trade.status;

      // Check if status changed
      if (newStatus !== oldStatus) {
        logger.info(
          `Order ${trade.order_id} status changed: ${oldStatus} → ${newStatus}`
        );

        // Update database
        await this.updateTradeStatus(trade.id, newStatus, orderStatus);

        // Broadcast change via WebSocket
        this.broadcastStatusChange({
          tradeId: trade.id,
          orderId: trade.order_id,
          oldStatus,
          newStatus,
          sizeFilled: orderStatus.sizeFilled,
          timestamp: Date.now(),
        });
      } else if (orderStatus.sizeFilled > 0 && orderStatus.status === 'LIVE') {
        // Partial fill on live order
        logger.debug(
          `Order ${trade.order_id} partially filled: ${orderStatus.sizeFilled}/${orderStatus.size}`
        );
        
        this.broadcastPartialFill({
          tradeId: trade.id,
          orderId: trade.order_id,
          sizeFilled: orderStatus.sizeFilled,
          totalSize: orderStatus.size,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to check order ${trade.order_id}: ${errorMessage}`);
    }
  }

  /**
   * Map CLOB status to internal OrderStatusType
   */
  private mapClobStatus(orderStatus: ClobOrderStatus): OrderStatusType {
    switch (orderStatus.status) {
      case 'LIVE':
        // Check if partially filled
        if (orderStatus.sizeFilled > 0 && orderStatus.sizeFilled < orderStatus.size) {
          return 'PARTIALLY_FILLED';
        }
        return 'OPEN';
      
      case 'MATCHED':
        return 'FILLED';
      
      case 'CANCELLED':
        return 'CANCELLED';
      
      case 'EXPIRED':
        return 'EXPIRED';
      
      default:
        logger.warn(`Unknown CLOB status: ${orderStatus.status}`);
        return 'OPEN';
    }
  }

  /**
   * Update trade status in database
   */
  private async updateTradeStatus(
    tradeId: string,
    newStatus: OrderStatusType,
    orderStatus: ClobOrderStatus
  ): Promise<void> {
    const { db } = await import('../models/database.js');

    try {
      if (newStatus === 'FILLED') {
        // Order fully filled - keep as OPEN until market resolves
        const stmt = db.prepare(`
          UPDATE real_trades
          SET status = 'OPEN'
          WHERE id = ?
        `);
        stmt.run(tradeId);
      } else if (newStatus === 'CANCELLED' || newStatus === 'EXPIRED') {
        // Order cancelled/expired - mark trade as cancelled
        const { cancelRealTrade } = await import('../models/realTrade.js');
        cancelRealTrade(tradeId);
      } else if (newStatus === 'PARTIALLY_FILLED') {
        // Still OPEN but partially filled - no status change needed
        // Could track fill progress in future enhancement
        logger.debug(`Trade ${tradeId} partially filled: ${orderStatus.sizeFilled}/${orderStatus.size}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to update trade status: ${errorMessage}`);
    }
  }

  /**
   * Broadcast status change via WebSocket
   */
  private broadcastStatusChange(change: OrderStatusChange): void {
    if (!this.wsManager) return;

    try {
      this.wsManager.sendOrderStatusChanged({
        ...change,
        type: 'status_changed',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to broadcast status change: ${errorMessage}`);
    }
  }

  /**
   * Broadcast partial fill notification
   */
  private broadcastPartialFill(data: any): void {
    if (!this.wsManager) return;

    try {
      this.wsManager.sendOrderPartialFill({
        ...data,
        type: 'partial_fill',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to broadcast partial fill: ${errorMessage}`);
    }
  }

  /**
   * Get current monitoring status
   */
  getStatus(): { running: boolean; clientCount: number } {
    return {
      running: this.isRunning,
      clientCount: this.wsManager?.getClientCount() || 0,
    };
  }

  /**
   * Force check of all orders (for manual trigger)
   */
  async forceCheck(): Promise<void> {
    logger.info('Forcing order status check...');
    await this.checkOrderStatuses();
  }
}

// Export singleton instance
export const orderStatusMonitor = new OrderStatusMonitor();
