import { describe, expect, it } from 'vitest';

import { getApiErrorCode } from '@/shared/utils';

describe('getApiErrorCode', () => {
  it('reads the code from the backend AppError body', () => {
    expect(getApiErrorCode({ success: false, error: { code: 'AUTH_RATE_LIMITED', message: 'x' } }))
      .toBe('AUTH_RATE_LIMITED');
  });

  it('returns undefined for other shapes', () => {
    expect(getApiErrorCode(null)).toBeUndefined();
    expect(getApiErrorCode({ error: 'plain string' })).toBeUndefined();
    expect(getApiErrorCode({ error: { code: 42 } })).toBeUndefined();
  });
});
