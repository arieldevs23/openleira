import assert from 'node:assert/strict';
import test from 'node:test';

import type { Request, Response } from 'express';

import { AppError } from '@/shared/utils.js';

import { createAttemptRateLimiter } from '../auth.rate-limit.js';

function fakeRequest(remoteAddress: string, forwardedFor?: string): Request {
  return {
    socket: { remoteAddress },
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
  } as unknown as Request;
}

function runLimiter(limiter: ReturnType<typeof createAttemptRateLimiter>, req: Request): unknown {
  let passedValue: unknown = 'not-called';
  const res = { setHeader: () => undefined } as unknown as Response;
  limiter(req, res, (value?: unknown) => { passedValue = value; });
  return passedValue;
}

test('blocks the 11th attempt from one IP inside the window, then resets', () => {
  let currentTime = 0;
  const limiter = createAttemptRateLimiter({ maxAttempts: 10, windowMs: 1000, now: () => currentTime });

  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(runLimiter(limiter, fakeRequest('203.0.113.5')), undefined);
  }
  const blocked = runLimiter(limiter, fakeRequest('203.0.113.5'));
  assert.ok(blocked instanceof AppError && blocked.statusCode === 429);
  assert.equal(runLimiter(limiter, fakeRequest('203.0.113.6')), undefined);

  currentTime = 1000;
  assert.equal(runLimiter(limiter, fakeRequest('203.0.113.5')), undefined);
});

test('keys by the proxy-appended forwarded address only behind a loopback proxy', () => {
  const limiter = createAttemptRateLimiter({ maxAttempts: 1, windowMs: 1000, now: () => 0 });

  assert.equal(runLimiter(limiter, fakeRequest('127.0.0.1', 'spoofed, 198.51.100.1')), undefined);
  assert.equal(runLimiter(limiter, fakeRequest('127.0.0.1', 'other, 198.51.100.2')), undefined);
  assert.ok(runLimiter(limiter, fakeRequest('127.0.0.1', 'changed, 198.51.100.1')) instanceof AppError);
  // A remote peer cannot pick its own bucket through the header.
  assert.equal(runLimiter(limiter, fakeRequest('203.0.113.9', '198.51.100.1')), undefined);
  assert.ok(runLimiter(limiter, fakeRequest('203.0.113.9', '198.51.100.3')) instanceof AppError);
});
