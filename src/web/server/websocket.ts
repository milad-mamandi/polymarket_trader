import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { logger } from '../../utils/logger.js';
import { getSession } from './middleware/auth.js';
import { URL } from 'url';

/**
 * WebSocket message types
 */
export interface WSMessage {
  type: 'portfolio' | 'trade:new' | 'trade:resolved' | 'whale:detected' | 'bot:status' | 'ping' | 'pong';
  data?: any;
  timestamp?: number;
}

/**
 * WebSocket client with metadata
 */
interface WSClient {
  socket: WebSocket;
  authenticated: boolean;
  connectedAt: number;
}

/**
 * WebSocket Manager
 */
export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Set<WSClient> = new Set();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.startPingInterval();
    
    logger.info('WebSocket server initialized at /ws');
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(socket: WebSocket, request: any) {
    // Verify authentication via session cookie
    const cookies = this.parseCookies(request.headers.cookie || '');
    const sessionId = cookies.sessionId;
    
    if (!sessionId || !getSession(sessionId)) {
      logger.debug('Unauthorized WebSocket connection attempt');
      socket.close(1008, 'Unauthorized');
      return;
    }
    
    const client: WSClient = {
      socket,
      authenticated: true,
      connectedAt: Date.now(),
    };
    
    this.clients.add(client);
    logger.info(`WebSocket client connected (${this.clients.size} total clients)`);
    
    // Send welcome message
    this.sendToClient(client, {
      type: 'pong',
      data: { message: 'Connected to Whale Scout' },
      timestamp: Date.now(),
    });
    
    // Handle messages
    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as WSMessage;
        this.handleMessage(client, message);
      } catch (error) {
        logger.debug('Invalid WebSocket message');
      }
    });
    
    // Handle disconnect
    socket.on('close', () => {
      this.clients.delete(client);
      logger.info(`WebSocket client disconnected (${this.clients.size} total clients)`);
    });
    
    // Handle errors
    socket.on('error', (error) => {
      logger.debug(`WebSocket client error: ${error instanceof Error ? error.message : String(error)}`);
      this.clients.delete(client);
    });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(client: WSClient, message: WSMessage) {
    switch (message.type) {
      case 'ping':
        this.sendToClient(client, {
          type: 'pong',
          timestamp: Date.now(),
        });
        break;
      default:
        logger.warn(`Unknown WebSocket message type: ${message.type}`);
    }
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(client: WSClient, message: WSMessage) {
    if (client.socket.readyState === WebSocket.OPEN) {
      try {
        client.socket.send(JSON.stringify(message));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error sending to client: ${errorMessage}`);
      }
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  public broadcast(message: WSMessage) {
    const messageStr = JSON.stringify({
      ...message,
      timestamp: message.timestamp || Date.now(),
    });
    
    let sent = 0;
    for (const client of this.clients) {
      if (client.socket.readyState === WebSocket.OPEN) {
        try {
          client.socket.send(messageStr);
          sent++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`Error broadcasting: ${errorMessage}`);
        }
      }
    }
    
    if (sent > 0) {
      logger.debug(`Broadcast ${message.type} to ${sent} client(s)`);
    }
  }

  /**
   * Send portfolio update
   */
  public sendPortfolioUpdate(data: any) {
    this.broadcast({
      type: 'portfolio',
      data,
    });
  }

  /**
   * Send new trade notification
   */
  public sendNewTrade(data: any) {
    this.broadcast({
      type: 'trade:new',
      data,
    });
  }

  /**
   * Send trade resolved notification
   */
  public sendTradeResolved(data: any) {
    this.broadcast({
      type: 'trade:resolved',
      data,
    });
  }

  /**
   * Send whale detected notification
   */
  public sendWhaleDetected(data: any) {
    this.broadcast({
      type: 'whale:detected',
      data,
    });
  }

  /**
   * Send bot status update
   */
  public sendBotStatus(data: any) {
    this.broadcast({
      type: 'bot:status',
      data,
    });
  }

  /**
   * Parse cookies from header
   */
  private parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    
    if (!cookieHeader) return cookies;
    
    cookieHeader.split(';').forEach((cookie) => {
      const [name, ...rest] = cookie.split('=');
      if (name && rest.length > 0) {
        cookies[name.trim()] = rest.join('=').trim();
      }
    });
    
    return cookies;
  }

  /**
   * Start ping interval to keep connections alive
   */
  private startPingInterval() {
    this.pingInterval = setInterval(() => {
      for (const client of this.clients) {
        if (client.socket.readyState === WebSocket.OPEN) {
          try {
            client.socket.ping();
          } catch (error) {
            // Client disconnected
            this.clients.delete(client);
          }
        } else {
          this.clients.delete(client);
        }
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Get connected client count
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Shutdown WebSocket server
   */
  public shutdown() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    for (const client of this.clients) {
      client.socket.close(1000, 'Server shutting down');
    }
    
    this.clients.clear();
    this.wss.close();
    logger.info('WebSocket server shut down');
  }
}
