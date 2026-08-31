export class WorkflowDeadlineExceededError extends Error {
  public constructor() {
    super('Jenkins workflow deadline expired');
    this.name = 'WorkflowDeadlineExceededError';
  }
}

/** A single immutable time budget shared by all work in one project run. */
export class WorkflowDeadline {
  public readonly expiresAt: number;

  public constructor(timeoutMs: number, now = Date.now()) {
    this.expiresAt = now + timeoutMs;
  }

  public remainingMs(now = Date.now()): number {
    return Math.max(0, this.expiresAt - now);
  }

  public requireRemaining(): number {
    const remaining = this.remainingMs();
    if (remaining === 0) {
      throw new WorkflowDeadlineExceededError();
    }
    return remaining;
  }
}

export async function withWorkflowDeadline<T>(
  operation: () => Promise<T>,
  deadline: WorkflowDeadline,
): Promise<T> {
  const timeoutMs = deadline.requireRemaining();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new WorkflowDeadlineExceededError()), timeoutMs);
    });
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export const CLEANUP_SETTLE_TIMEOUT_MS = 5_000;

export async function withHardTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage = 'Operation exceeded hard timeout',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function settleCleanup(
  operation: () => Promise<unknown>,
  timeoutMs: number = CLEANUP_SETTLE_TIMEOUT_MS,
): Promise<void> {
  await withHardTimeout(operation, timeoutMs).catch(() => undefined);
}

export async function withWorkflowDeadlineAndLateResource<T>(
  operation: () => Promise<T>,
  deadline: WorkflowDeadline,
  onLateResource: (resource: T) => Promise<void>,
): Promise<T> {
  const timeoutMs = deadline.requireRemaining();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = Promise.resolve().then(operation);
  void pending.then(
    (resource) => {
      if (timedOut) {
        void Promise.resolve().then(() => onLateResource(resource)).catch(() => undefined);
      }
    },
    () => undefined,
  );
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(new WorkflowDeadlineExceededError());
      }, timeoutMs);
    });
    return await Promise.race([pending, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
