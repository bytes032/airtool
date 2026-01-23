import type { AirtableRetryContext, AirtableRetryOptions } from './types.js';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MIN_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 5000;

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function getAirtableErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const anyError = error as { statusCode?: number; status?: number };
  if (typeof anyError.statusCode === 'number') return anyError.statusCode;
  if (typeof anyError.status === 'number') return anyError.status;
  return undefined;
}

export function isRateLimitError(error: unknown): boolean {
  const status = getAirtableErrorStatus(error);
  if (status === 429) return true;
  if (error && typeof error === 'object') {
    const anyError = error as { error?: string; type?: string; message?: string };
    const token = `${anyError.error ?? ''} ${anyError.type ?? ''} ${anyError.message ?? ''}`.toLowerCase();
    if (token.includes('rate') && token.includes('limit')) return true;
  }
  return false;
}

export function isRetryableError(error: unknown): boolean {
  const status = getAirtableErrorStatus(error);
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500 && status <= 599) return true;
  return isRateLimitError(error);
}

export function calculateRetryDelayMs(options: AirtableRetryOptions, attempt: number): number {
  const minDelay = options.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
  const maxDelay = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const rawDelay = Math.min(maxDelay, minDelay * 2 ** attempt);
  const jitter = options.jitter ?? true;
  if (!jitter) return rawDelay;
  const jitterFactor = 0.5 + Math.random() * 0.5;
  return Math.max(0, Math.round(rawDelay * jitterFactor));
}

export async function runWithRetry<T>(operation: () => Promise<T>, options: AirtableRetryOptions = {}): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      const shouldRetry = options.shouldRetry ? options.shouldRetry(error, attempt) : isRetryableError(error);

      if (!shouldRetry || attempt >= maxRetries) {
        throw error;
      }

      const delayMs = calculateRetryDelayMs(options, attempt);
      const context: AirtableRetryContext = { attempt, delayMs, error };
      options.onRetry?.(context);
      options.logger?.warn?.('Retrying Airtable request', context);

      attempt += 1;
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }
}
