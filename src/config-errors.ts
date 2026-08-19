export class ConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    const normalizedIssues = issues.filter((issue) => issue.length > 0);
    super(
      `Invalid configuration: ${
        normalizedIssues.join('; ') || 'unknown configuration error'
      }`,
    );
    this.name = 'ConfigError';
    this.issues = normalizedIssues;
  }
}

export function redactText(
  value: string,
  secrets: readonly string[] = [],
): string {
  let redacted = value;
  for (const secret of [...secrets]
    .filter((candidate) => candidate.length > 0)
    .sort((left, right) => right.length - left.length)) {
    redacted = redacted.split(secret).join('[REDACTED]');
  }

  return redacted
    .replace(
      /https?:\/\/[^/\s:@]+:[^@/\s]+@/giu,
      (match) => {
        const protocolEnd = match.indexOf('//') + 2;
        return `${match.slice(0, protocolEnd)}[REDACTED]:[REDACTED]@`;
      },
    )
    .replace(
      /((?:password|passphrase|token|secret|authorization|cookie|credential|api[_-]?key)(?:["']?\s*[:=]\s*["']?))([^"',}\s&]+)/giu,
      '$1[REDACTED]',
    )
    .replace(
      /((?:authorization|cookie)(?:["']?\s*[:=]\s*["']?))(?:bearer|basic)?\s*[^"',}\s]+(?:\s+[^"',}\s]+)?/giu,
      '$1[REDACTED]',
    )
    .slice(0, 2_000);
}

export function formatDiagnostic(
  error: unknown,
  secrets: readonly string[] = [],
): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown error';
  return redactText(message, secrets);
}

export function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return redactText(value);
  }
}
