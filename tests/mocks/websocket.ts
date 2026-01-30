/**
 * Mock WebSocket for testing
 * Simulates WebSocket behavior without actual connections
 */

type WebSocketEventType =
  | 'portfolio'
  | 'trade:new'
  | 'trade:resolved'
  | 'whale:detected'
  | 'bot:status'
  | 'order:status_changed'
  | 'order:filled'
  | 'order:partial_fill';

interface WebSocketMessage {
  type: WebSocketEventType;
  data: any;
}

export class MockWebSocket {
  public readyState: number = 0; // 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
  public url: string;
  private messageHandler: ((event: { data: string }) => void) | null = null;
  private openHandler: (() => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private errorHandler: ((error: any) => void) | null = null;
  private messages: WebSocketMessage[] = [];

  constructor(url: string) {
    this.url = url;
    // Simulate async connection
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.openHandler) {
        this.openHandler();
      }
    }, 10);
  }

  /**
   * Send a message (simulated)
   */
  send(data: string): void {
    if (this.readyState !== 1) {
      throw new Error('WebSocket is not open');
    }
    // In tests, we don't actually send anything
    // But we could track sent messages if needed
  }

  /**
   * Close connection
   */
  close(): void {
    this.readyState = 3; // CLOSED
    if (this.closeHandler) {
      this.closeHandler();
    }
  }

  /**
   * Set message handler
   */
  set onmessage(handler: (event: { data: string }) => void) {
    this.messageHandler = handler;
  }

  /**
   * Set open handler
   */
  set onopen(handler: () => void) {
    this.openHandler = handler;
  }

  /**
   * Set close handler
   */
  set onclose(handler: () => void) {
    this.closeHandler = handler;
  }

  /**
   * Set error handler
   */
  set onerror(handler: (error: any) => void) {
    this.errorHandler = handler;
  }

  /**
   * Simulate receiving a message
   */
  simulateMessage(message: WebSocketMessage): void {
    if (this.messageHandler) {
      this.messageHandler({ data: JSON.stringify(message) });
    }
    this.messages.push(message);
  }

  /**
   * Simulate an error
   */
  simulateError(error: any): void {
    if (this.errorHandler) {
      this.errorHandler(error);
    }
  }

  /**
   * Get all received messages
   */
  getMessages(): WebSocketMessage[] {
    return this.messages;
  }

  /**
   * Clear message history
   */
  clearMessages(): void {
    this.messages = [];
  }
}

/**
 * Mock WebSocket manager for testing dashboard WebSocket
 */
export class MockWebSocketManager {
  private clients: Set<MockWebSocket> = new Set();
  private broadcastHistory: WebSocketMessage[] = [];

  /**
   * Register a client
   */
  addClient(client: MockWebSocket): void {
    this.clients.add(client);
  }

  /**
   * Remove a client
   */
  removeClient(client: MockWebSocket): void {
    this.clients.delete(client);
  }

  /**
   * Broadcast a message to all clients
   */
  broadcast(message: WebSocketMessage): void {
    this.broadcastHistory.push(message);
    this.clients.forEach((client) => {
      if (client.readyState === 1) {
        // OPEN
        client.simulateMessage(message);
      }
    });
  }

  /**
   * Get broadcast history
   */
  getBroadcastHistory(): WebSocketMessage[] {
    return this.broadcastHistory;
  }

  /**
   * Clear broadcast history
   */
  clearHistory(): void {
    this.broadcastHistory = [];
  }

  /**
   * Get active client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close all clients
   */
  closeAllClients(): void {
    this.clients.forEach((client) => {
      client.close();
    });
    this.clients.clear();
  }

  /**
   * Reset manager
   */
  reset(): void {
    this.closeAllClients();
    this.clearHistory();
  }
}

/**
 * Create a mock WebSocket instance
 */
export function createMockWebSocket(url: string): MockWebSocket {
  return new MockWebSocket(url);
}

/**
 * Create a mock WebSocket manager
 */
export function createMockWebSocketManager(): MockWebSocketManager {
  return new MockWebSocketManager();
}

/**
 * Default mock instances
 */
export const mockWebSocketManager = createMockWebSocketManager();
