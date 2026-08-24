import type {
  SnykFinding,
  SnykScanMetadata,
  SnykSeverity,
  SnykSeverityCounts,
  SnykSummary,
} from '../../result-types.js';
import type { SnykHtmlEvidence } from './snyk-html-extractor.js';
import type { ParsedSnykSummary } from './snyk-summary-parser.js';
import { assertSafeReferenceUrl } from '../../security/url-policy.js';

export const SNYK_MAX_DETAILED_FINDINGS = 500;
const MAX_TEXT = 8_192;
const MAX_SHORT_TEXT = 1_024;
const MAX_PATHS = 64;
const MAX_REFERENCES = 64;

export interface SnykNormalizationInput {
  html: SnykHtmlEvidence;
  summary?: ParsedSnykSummary;
  warnings?: readonly string[];
}

export interface NormalizedSnykEvidence {
  state: 'found' | 'incomplete';
  summary: SnykSummary;
  findings: SnykFinding[];
  warnings: string[];
}

const SEVERITIES: readonly SnykSeverity[] = ['critical', 'high', 'medium', 'low'];

function clip(value: string | undefined, maximum: number): string | undefined {
  const normalized = value?.replace(/\s+/gu, ' ').trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized.slice(0, maximum);
}

function safeReference(value: string): string | undefined {
  try {
    const url = assertSafeReferenceUrl(value);
    return url.length <= 2_048 ? url : undefined;
  } catch {
    return undefined;
  }
}

function unique(values: readonly string[], maximum: number, length: number): string[] {
  return [...new Set(values.map((value) => clip(value, length)).filter((value): value is string => value !== undefined))]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    .slice(0, maximum);
}

function normalizeFinding(value: SnykFinding): SnykFinding {
  const paths = value.paths === undefined ? undefined : unique(value.paths, MAX_PATHS, MAX_TEXT);
  const id = clip(value.id, 256);
  const title = clip(value.title, MAX_SHORT_TEXT);
  const module = clip(value.module, MAX_SHORT_TEXT);
  const description = clip(value.description, MAX_TEXT);
  const remediation = clip(value.remediation, MAX_TEXT);
  const references = value.references === undefined
    ? undefined
    : unique(value.references.map(safeReference).filter((item): item is string => item !== undefined), MAX_REFERENCES, 2_048);
  return {
    ...(id === undefined ? {} : { id }),
    ...(title === undefined ? {} : { title }),
    severity: value.severity,
    ...(module === undefined ? {} : { module }),
    ...(description === undefined ? {} : { description }),
    ...(remediation === undefined ? {} : { remediation }),
    ...(paths === undefined ? {} : { paths }),
    ...(references === undefined ? {} : { references }),
  };
}

function findingKey(value: SnykFinding): string {
  return value.id === undefined
    ? [value.severity, value.title, value.module, value.description, value.paths?.join('|'), value.references?.join('|')].join('\u0001')
    : `id:${value.id}`;
}

function sortFindings(left: SnykFinding, right: SnykFinding): number {
  const severityOrder = new Map(SEVERITIES.map((severity, index) => [severity, index]));
  const leftKey = [severityOrder.get(left.severity) ?? SEVERITIES.length, left.id ?? '', left.title ?? '', left.module ?? '', JSON.stringify(left)].join('\u0001');
  const rightKey = [severityOrder.get(right.severity) ?? SEVERITIES.length, right.id ?? '', right.title ?? '', right.module ?? '', JSON.stringify(right)].join('\u0001');
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function countsFromFindings(findings: readonly SnykFinding[]): SnykSeverityCounts {
  const counts: SnykSeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

function mergeFindings(left: SnykFinding, right: SnykFinding): SnykFinding {
  const choose = (...values: (string | undefined)[]): string | undefined => values
    .filter((value): value is string => value !== undefined)
    .sort((a, b) => a < b ? -1 : a > b ? 1 : 0)[0];
  const id = choose(left.id, right.id);
  const title = choose(left.title, right.title);
  const module = choose(left.module, right.module);
  const description = choose(left.description, right.description);
  const remediation = choose(left.remediation, right.remediation);
  const severity = [left.severity, right.severity].sort((a, b) => SEVERITIES.indexOf(a) - SEVERITIES.indexOf(b))[0] as SnykSeverity;
  const paths = unique([...(left.paths ?? []), ...(right.paths ?? [])], MAX_PATHS, MAX_TEXT);
  const references = unique([...(left.references ?? []), ...(right.references ?? [])], MAX_REFERENCES, 2_048);
  return {
    ...(id === undefined ? {} : { id }),
    ...(title === undefined ? {} : { title }),
    severity,
    ...(module === undefined ? {} : { module }),
    ...(description === undefined ? {} : { description }),
    ...(remediation === undefined ? {} : { remediation }),
    ...(paths.length === 0 ? {} : { paths }),
    ...(references.length === 0 ? {} : { references }),
  };
}

function metadata(value: SnykScanMetadata): SnykScanMetadata | undefined {
  const scannedPath = clip(value.scannedPath, MAX_TEXT);
  const packageManager = clip(value.packageManager, MAX_SHORT_TEXT);
  const rawDependencyCount = value.dependencyCount;
  const rawDependencyPathCount = value.dependencyPathCount;
  const dependencyCount = typeof rawDependencyCount === 'number' && Number.isSafeInteger(rawDependencyCount) && rawDependencyCount >= 0
    ? rawDependencyCount
    : undefined;
  const dependencyPathCount = typeof rawDependencyPathCount === 'number' && Number.isSafeInteger(rawDependencyPathCount) && rawDependencyPathCount >= 0
    ? rawDependencyPathCount
    : undefined;
  const result: SnykScanMetadata = {
    ...(scannedPath === undefined ? {} : { scannedPath }),
    ...(packageManager === undefined ? {} : { packageManager }),
    ...(dependencyCount === undefined ? {} : { dependencyCount }),
    ...(dependencyPathCount === undefined ? {} : { dependencyPathCount }),
  };
  return Object.keys(result).length === 0 ? undefined : result;
}

export function normalizeSnykEvidence(input: SnykNormalizationInput): NormalizedSnykEvidence {
  const warnings = [
    ...(input.warnings ?? []),
    ...(input.summary?.warnings ?? []),
    ...(input.html.warnings ?? []),
  ];
  const normalized = input.html.findings.map(normalizeFinding);
  const deduplicatedMap = new Map<string, SnykFinding>();
  let conflictingDuplicateSeverity = false;
  for (const finding of normalized) {
    const key = findingKey(finding);
    const previous = deduplicatedMap.get(key);
    if (previous === undefined) deduplicatedMap.set(key, finding);
    else {
      conflictingDuplicateSeverity ||= previous.severity !== finding.severity;
      deduplicatedMap.set(key, mergeFindings(previous, finding));
    }
  }
  if (conflictingDuplicateSeverity) warnings.push('Snyk duplicate findings had conflicting severity values');
  const deduplicated = [...deduplicatedMap.values()].sort(sortFindings);
  const summaryCounts = input.summary?.counts ?? input.html.severityCounts ?? countsFromFindings(deduplicated);
  if (input.html.hasDetailCards && input.summary?.counts !== undefined) {
    const observedCounts = countsFromFindings(deduplicated);
    const mismatches = SEVERITIES.filter((severity) => summaryCounts[severity] !== observedCounts[severity]);
    if (mismatches.length > 0) {
      warnings.push(`Snyk summary/detail severity mismatch: ${mismatches.map((severity) =>
        `${severity} summary=${summaryCounts[severity]} observed=${observedCounts[severity]}`).join(', ')}`);
    }
  }
  if (input.summary?.counts === undefined && input.html.severityCounts === undefined && deduplicated.length === 0) {
    warnings.push('Snyk evidence contains no severity totals or detailed findings');
  }
  const findings = deduplicated.slice(0, SNYK_MAX_DETAILED_FINDINGS);
  const detail = {
    totalObserved: deduplicated.length,
    retainedCount: findings.length,
    truncated: deduplicated.length > SNYK_MAX_DETAILED_FINDINGS,
    omittedCount: Math.max(0, deduplicated.length - findings.length),
  };
  const summary: SnykSummary = {
    counts: summaryCounts,
    detail,
  };
  const scanMetadata = metadata(input.html.metadata);
  if (scanMetadata !== undefined) summary.metadata = scanMetadata;
  return {
    state: warnings.length === 0 ? 'found' : 'incomplete',
    summary,
    findings,
    warnings,
  };
}
