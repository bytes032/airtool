import { describe, expect, it } from 'vitest';
import { runWithRetry } from '../src/retry.js';

describe('runWithRetry', () => {
  it('retries when rate limited', async () => {
    let attempts = 0;
    const result = await runWithRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          const error = { statusCode: 429 };
          throw error;
        }
        return 'ok';
      },
      { maxRetries: 5, minDelayMs: 0, maxDelayMs: 0, jitter: false },
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });
});
