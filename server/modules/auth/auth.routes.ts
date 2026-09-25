import express from 'express';
import type { RequestHandler } from 'express';

import { createAttemptRateLimiter } from './auth.rate-limit.js';
import type { createAuthService } from './auth.service.js';

// 10 attempts per 15 minutes per IP, counted separately per endpoint.
const AUTH_ATTEMPT_LIMIT = { maxAttempts: 10, windowMs: 15 * 60 * 1000 };

type AuthenticatedRequest = express.Request & { user?: unknown };

/**
 * Creates the Auth transport adapter. Handlers only parse request data and
 * delegate authentication behavior to the injected application service.
 */
export function createAuthRouter(
  service: ReturnType<typeof createAuthService>,
  authenticateToken: RequestHandler,
): express.Router {
  const router = express.Router();
  const loginRateLimit = createAttemptRateLimiter(AUTH_ATTEMPT_LIMIT);
  const changePasswordRateLimit = createAttemptRateLimiter(AUTH_ATTEMPT_LIMIT);

  router.get('/status', (_req, res, next) => {
    try {
      res.json(service.getStatus());
    } catch (error) {
      next(error);
    }
  });

  router.post('/register', async (req, res, next) => {
    try {
      const body = req.body as { username?: unknown; password?: unknown };
      res.json(await service.register(body.username, body.password));
    } catch (error) {
      next(error);
    }
  });

  router.post('/login', loginRateLimit, async (req, res, next) => {
    try {
      const body = req.body as { username?: unknown; password?: unknown };
      res.json(await service.login(body.username, body.password));
    } catch (error) {
      next(error);
    }
  });

  router.get('/user', authenticateToken, (req, res) => {
    res.json(service.getCurrentUser((req as AuthenticatedRequest).user));
  });

  router.post('/refresh', authenticateToken, (req, res) => {
    res.json(service.refreshSession((req as AuthenticatedRequest).user));
  });

  router.post('/change-password', authenticateToken, changePasswordRateLimit, async (req, res, next) => {
    try {
      const body = req.body as { currentPassword?: unknown; newPassword?: unknown };
      res.json(await service.changePassword(
        (req as AuthenticatedRequest).user,
        body.currentPassword,
        body.newPassword,
      ));
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', authenticateToken, (_req, res) => {
    res.json(service.logout());
  });

  return router;
}
