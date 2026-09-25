import type { Request, RequestHandler } from 'express';

import { AppError } from '@/shared/utils.js';

type AttemptWindow = {
  count: number;
  resetAt: number;
};

type AttemptRateLimiterOptions = {
  maxAttempts: number;
  windowMs: number;
  now?: () => number;
};

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Resolves the client IP without enabling Express `trust proxy` globally.
 * X-Forwarded-For is honoured only when the direct peer is a local reverse
 * proxy (Caddy/nginx on the same host); its rightmost entry is the one that
 * proxy appended, so a client cannot spoof it to dodge the limit.
 */
function resolveClientAddress(req: Request): string {
  const peerAddress = req.socket.remoteAddress ?? 'unknown';
  const forwardedFor = req.headers['x-forwarded-for'];
  if (!LOOPBACK_ADDRESSES.has(peerAddress) || typeof forwardedFor !== 'string') {
    return peerAddress;
  }
  const forwardedAddresses = forwardedFor.split(',').map((entry) => entry.trim()).filter(Boolean);
  return forwardedAddresses.at(-1) ?? peerAddress;
}

/**
 * Fixed-window, in-memory attempt limiter keyed by client IP. Used by the auth
 * router for login and change-password. State is per process and resets on
 * restart, which is enough to blunt online password guessing.
 */
export function createAttemptRateLimiter(options: AttemptRateLimiterOptions): RequestHandler {
  const now = options.now ?? Date.now;
  const windowsByAddress = new Map<string, AttemptWindow>();

  return (req, res, next) => {
    const currentTime = now();
    // Prune lazily so the map cannot grow without bound under address churn.
    if (windowsByAddress.size > 1000) {
      for (const [address, window] of windowsByAddress) {
        if (window.resetAt <= currentTime) windowsByAddress.delete(address);
      }
    }

    const address = resolveClientAddress(req);
    let window = windowsByAddress.get(address);
    if (!window || window.resetAt <= currentTime) {
      window = { count: 0, resetAt: currentTime + options.windowMs };
      windowsByAddress.set(address, window);
    }

    window.count += 1;
    if (window.count > options.maxAttempts) {
      const retryAfterSeconds = Math.ceil((window.resetAt - currentTime) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      next(new AppError('Too many attempts. Try again later.', {
        code: 'AUTH_RATE_LIMITED',
        statusCode: 429,
        details: { retryAfterSeconds },
      }));
      return;
    }
    next();
  };
}
