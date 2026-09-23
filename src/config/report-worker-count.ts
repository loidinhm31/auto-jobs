export const DEFAULT_REPORT_WORKERS = 1;
export const MAX_REPORT_WORKERS = 4;

export function normalizeReportWorkerCount(
  value: unknown,
  fieldName = 'reportWorkers',
): number {
  if (value === undefined) {
    return DEFAULT_REPORT_WORKERS;
  }
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_REPORT_WORKERS
  ) {
    throw new RangeError(
      `${fieldName} must be an integer between 1 and ${MAX_REPORT_WORKERS}`,
    );
  }
  return value;
}
