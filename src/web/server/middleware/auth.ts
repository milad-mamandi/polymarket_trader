import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { CONFIG } from '../../../config/settings.js';

/**
 * Extended Request type with session
 */
export interface AuthRequest extends Request {
  session?: {
    authenticated?: boolean;
    loginTime?: number;
  };
}

/**
 * Session store (in-memory for simplicity)
 * In production, use Redis or similar
 */
const sessions = new Map<string, { authenticated: boolean; loginTime: number }>();

/**
 * Generate session ID
 */
function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Check if a string is a bcrypt hash
 */
function isBcryptHash(str: string): boolean {
  return str.startsWith('$2a$') || str.startsWith('$2b$') || str.startsWith('$2y$');
}

/**
 * Verify password - supports both hashed and plain text
 */
export async function verifyPassword(password: string): Promise<boolean> {
  const stored = CONFIG.DASHBOARD_PASSWORD;
  
  // Check if stored password is a bcrypt hash
  if (isBcryptHash(stored)) {
    return await bcrypt.compare(password, stored);
  }
  
  // Fallback for plain text passwords (backward compatible)
  return password === stored;
}

/**
 * Create session
 */
export function createSession(req: Request, res: Response): string {
  const sessionId = generateSessionId();
  const session = {
    authenticated: true,
    loginTime: Date.now(),
  };
  
  sessions.set(sessionId, session);
  
  // Detect if request came via HTTPS (direct or via Cloudflare/proxy)
  const isSecure = req.secure || 
    req.get('x-forwarded-proto') === 'https' ||
    req.get('cf-visitor')?.includes('"scheme":"https"');
  
  // Set cookie
  res.cookie('sessionId', sessionId, {
    httpOnly: true,
    secure: isSecure,  // Only secure if actually using HTTPS
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: isSecure ? 'strict' : 'lax',  // Lax for HTTP compatibility
  });
  
  return sessionId;
}

/**
 * Destroy session
 */
export function destroySession(req: AuthRequest, res: Response): void {
  const sessionId = req.cookies?.sessionId;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.clearCookie('sessionId');
}

/**
 * Get session
 */
export function getSession(sessionId: string) {
  return sessions.get(sessionId);
}

/**
 * Authentication middleware
 */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const sessionId = req.cookies?.sessionId;
  
  if (!sessionId) {
    res.status(401).json({ error: 'Unauthorized', message: 'No session found' });
    return;
  }
  
  const session = sessions.get(sessionId);
  
  if (!session || !session.authenticated) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid session' });
    return;
  }
  
  // Check if session is expired (24 hours)
  const sessionAge = Date.now() - session.loginTime;
  if (sessionAge > 24 * 60 * 60 * 1000) {
    sessions.delete(sessionId);
    res.clearCookie('sessionId');
    res.status(401).json({ error: 'Unauthorized', message: 'Session expired' });
    return;
  }
  
  req.session = session;
  next();
}

/**
 * Optional auth middleware (doesn't fail if not authenticated)
 */
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const sessionId = req.cookies?.sessionId;
  
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (session && session.authenticated) {
      req.session = session;
    }
  }
  
  next();
}
