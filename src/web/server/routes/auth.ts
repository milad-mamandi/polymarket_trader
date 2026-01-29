import { Router, Request, Response } from 'express';
import { verifyPassword, createSession, destroySession, requireAuth, AuthRequest } from '../middleware/auth.js';
import { logger } from '../../../utils/logger.js';

const router = Router();

/**
 * POST /api/auth/login
 * Login with password
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      res.status(400).json({ error: 'Password required' });
      return;
    }
    
    const isValid = await verifyPassword(password);
    
    if (!isValid) {
      logger.warn('Failed login attempt from ' + req.ip);
      res.status(401).json({ error: 'Invalid password' });
      return;
    }
    
    const sessionId = createSession(res);
    logger.info('Successful login from ' + req.ip);
    
    res.json({ success: true, message: 'Login successful' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Login error: ${errorMessage}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/logout
 * Logout and destroy session
 */
router.post('/logout', (req: AuthRequest, res: Response) => {
  try {
    destroySession(req, res);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Logout error: ${errorMessage}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/check
 * Check if authenticated
 */
router.get('/check', requireAuth, (req: AuthRequest, res: Response) => {
  res.json({ 
    authenticated: true,
    loginTime: req.session?.loginTime || Date.now(),
  });
});

export default router;
