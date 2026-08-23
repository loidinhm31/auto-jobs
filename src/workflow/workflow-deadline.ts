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
