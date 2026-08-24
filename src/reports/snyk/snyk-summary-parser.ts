import type { SnykSeverity, SnykSeverityCounts } from '../../result-types.js';

const SEVERITIES: readonly SnykSeverity[] = ['critical', 'high', 'medium', 'low'];
const MAX_SUMMARY_COUNT = 10_000_000;
export const MAX_SUMMARY_BYTES = 1_048_576;

export interface ParsedSnykSummary {
  counts?: SnykSeverityCounts;
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSnykSummary(value: unknown): ParsedSnykSummary {
  if (!isRecord(value) || !isRecord(value.severity_counts)) {
    return { warnings: ['Snyk summary JSON has no severity_counts object'] };
  }
  const counts = {} as Partial<SnykSeverityCounts>;
  const warnings: string[] = [];
  for (const severity of SEVERITIES) {
    const count = value.severity_counts[severity];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count > MAX_SUMMARY_COUNT) {
      warnings.push(`Snyk summary ${severity} count is invalid`);
      continue;
    }
    counts[severity] = count;
  }
  if (warnings.length > 0 || SEVERITIES.some((severity) => counts[severity] === undefined)) {
    return { warnings };
  }
  return { counts: counts as SnykSeverityCounts, warnings };
}

export function parseSnykSummaryJson(text: string): ParsedSnykSummary {
  if (new TextEncoder().encode(text).byteLength > MAX_SUMMARY_BYTES) {
    return { warnings: [`Snyk summary JSON exceeds the ${MAX_SUMMARY_BYTES}-byte limit`] };
  }
  try {
    return parseSnykSummary(JSON.parse(text) as unknown);
  } catch {
    return { warnings: ['Snyk summary JSON could not be parsed'] };
  }
}
