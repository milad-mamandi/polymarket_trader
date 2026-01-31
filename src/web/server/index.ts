import express, { Express, Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../../config/settings.js';
import { logger } from '../../utils/logger.js';
import { WebSocketManager } from './websocket.js';

// Import routes
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import controlRoutes from './routes/controls.js';
import configRoutes from './routes/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Dashboard Server
 */
export class DashboardServer {
  private app: Express;
  private server: HTTPServer;
  private wsManager: WebSocketManager | null = null;
  private port: number;

  constructor(port?: number) {
    this.port = port || CONFIG.DASHBOARD_PORT;
    this.app = express();
    this.server = createServer(this.app);
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware() {
    // Trust proxy (for Cloudflare, nginx, etc.)
    this.app.set('trust proxy', 1);
    
    // Security
    this.app.use(helmet({
      contentSecurityPolicy: false, // Allow inline scripts for React
    }));
    
    // CORS - allow all origins since auth is handled by cookies
    this.app.use(cors({
      origin: true,  // Reflect request origin
      credentials: true,
    }));
    
    // Rate limiting - only on login endpoint to prevent brute force
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 login attempts per 15 minutes
      message: 'Too many login attempts',
    });
    
    this.app.use('/api/auth/login', authLimiter);
    
    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Cookie parsing
    this.app.use(cookieParser());
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup routes
   */
  private setupRoutes() {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ 
        status: 'ok', 
        dashboard: 'running',
        websocket: this.wsManager ? `${this.wsManager.getClientCount()} clients` : 'not started',
      });
    });
    
    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api', apiRoutes);
    this.app.use('/api/bot', controlRoutes);
    this.app.use('/api/config', configRoutes);
    
    // Serve static files (React build)
    // When running from dist/, we need to go back to project root and into src
    // Path: dist/web/server/index.js -> ../../../src/web/client/dist
    const clientBuildPath = path.resolve(__dirname, '../../../src/web/client/dist');
    
    logger.debug(`Serving static files from: ${clientBuildPath}`);
    this.app.use(express.static(clientBuildPath));
    
    // SPA fallback - serve index.html for all other routes (but not API routes)
    this.app.get(/^(?!\/api|\/ws).*/, (req: Request, res: Response) => {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
    
    // Error handler
    this.app.use((err: any, req: Request, res: Response, next: any) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`Server error: ${errorMessage}`);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        logger.info(`🚀 Dashboard server running on http://localhost:${this.port}`);
        
        // Initialize WebSocket server
        this.wsManager = new WebSocketManager(this.server);
        
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.wsManager) {
        this.wsManager.shutdown();
      }
      
      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          logger.info('Dashboard server stopped');
          resolve();
        }
      });
    });
  }

  /**
   * Get WebSocket manager
   */
  public getWebSocketManager(): WebSocketManager | null {
    return this.wsManager;
  }

  /**
   * Get Express app (for testing)
   */
  public getApp(): Express {
    return this.app;
  }
}

// Export singleton instance
let serverInstance: DashboardServer | null = null;

export function getDashboardServer(port?: number): DashboardServer {
  if (!serverInstance) {
    serverInstance = new DashboardServer(port);
  }
  return serverInstance;
}

export function getWebSocketManager(): WebSocketManager | null {
  return serverInstance?.getWebSocketManager() || null;
}
