export const MAX_DIAGNOSTIC_ITEMS = 32;
export const MAX_DIAGNOSTIC_LENGTH = 500;

export function pushDiagnostic(target: string[], value: string): void {
  target.push(value.slice(0, MAX_DIAGNOSTIC_LENGTH));
  while (target.length > MAX_DIAGNOSTIC_ITEMS) target.shift();
}

export function boundedDiagnostics(values: readonly string[]): string[] {
  return values.slice(-MAX_DIAGNOSTIC_ITEMS).map((value) => value.slice(0, MAX_DIAGNOSTIC_LENGTH));
}
