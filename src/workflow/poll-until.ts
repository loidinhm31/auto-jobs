import { WorkflowDeadline } from './workflow-deadline.js';

export interface PollObservation<T> {
  at: string;
  error?: string;
  value?: T;
}

export interface PollResult<T> {
  value: T;
  lastValue?: T;
  lastError?: unknown;
  observations: readonly PollObservation<T>[];
}

export interface PollUntilOptions<T> {
  deadline: WorkflowDeadline;
  intervalMs: number;
  observe: () => Promise<T | undefined>;
  accept: (value: T) => boolean;
  maxObservations?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
}

function pause(durationMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, durationMs);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('Polling aborted'));
    }, { once: true });
  });
}

/** Polls with only the configured interval and one absolute deadline. */
export async function pollUntil<T>(options: PollUntilOptions<T>): Promise<PollResult<T>> {
  const observations: PollObservation<T>[] = [];
  const maxObservations = options.maxObservations ?? 32;
  const maxAttempts = options.maxAttempts ?? Number.POSITIVE_INFINITY;
  if (options.maxAttempts !== undefined && (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1)) {
    throw new Error('Polling attempt limit must be a positive safe integer');
  }
  let lastValue: T | undefined;
  let lastError: unknown;
  let attempts = 0;

  while (options.deadline.remainingMs() > 0) {
    if (attempts >= maxAttempts) throw new Error('Jenkins polling attempt limit was reached');
    attempts += 1;
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error('Polling aborted');
    }
    try {
      const value = await options.observe();
      if (value !== undefined) {
        lastValue = value;
        observations.push({ at: new Date().toISOString(), value });
        if (options.accept(value)) {
          return { value, lastValue, lastError, observations };
        }
      }
    } catch (error) {
      lastError = error;
      observations.push({
        at: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown observation error',
      });
    }
    while (observations.length > maxObservations) observations.shift();
    await pause(Math.min(options.intervalMs, options.deadline.requireRemaining()), options.signal);
  }

  throw new Error('Jenkins polling condition was not satisfied before the deadline');
}
